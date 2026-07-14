import * as core from '@actions/core';
import * as github from '@actions/github';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { glob } from 'glob';
import { loadConfig, analyze, allRules, diffScans, formatDiffAsMarkdown, getParserForFile, buildGlob } from '@uiseal/core';
import type { Violation, ViolationSnapshot, uisealConfig } from '@uiseal/core';

// Category lookup: Violation doesn't carry category but ViolationSnapshot requires it.
const ruleCategoryMap = new Map<string, ViolationSnapshot['category']>(
  allRules.map(r => [r.id, r.category] as [string, ViolationSnapshot['category']]),
);

function toSnapshot(v: Violation): ViolationSnapshot {
  return {
    ruleId: v.ruleId,
    file: v.file,
    line: v.line,
    column: v.column,
    message: v.message,
    severity: v.severity,
    category: ruleCategoryMap.get(v.ruleId) ?? 'quality',
    ...(v.fix ? { fix: v.fix } : {}),
  };
}

async function collectSnapshots(
  filePaths: string[],
  config: uisealConfig,
): Promise<ViolationSnapshot[]> {
  const files = new Map<string, string>();
  for (const fp of filePaths) {
    const abs = path.resolve(fp);
    if (fs.existsSync(abs)) {
      files.set(abs, fs.readFileSync(abs, 'utf8'));
    }
  }
  const { violations } = await analyze({ files, config, rules: allRules });
  return violations.map(toSnapshot);
}

function getPrNumber(): number {
  const eventPath = process.env['GITHUB_EVENT_PATH'];
  if (!eventPath) throw new Error('GITHUB_EVENT_PATH not set');
  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8')) as {
    pull_request?: { number?: number };
  };
  const prNumber = event.pull_request?.number;
  if (prNumber == null) throw new Error('Could not read pull_request.number from event payload');
  return prNumber;
}

async function postOrUpdatePrComment(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
): Promise<void> {
  const apiBase = `https://api.github.com/repos/${owner}/${repo}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const listResp = await fetch(`${apiBase}/issues/${prNumber}/comments`, { headers });
  if (!listResp.ok) {
    throw new Error(`Failed to list PR comments: ${listResp.status} ${listResp.statusText}`);
  }
  const comments = (await listResp.json()) as Array<{ id: number; body: string }>;
  const existing = comments.find(c => c.body.includes('🦭 UISeal PR Review'));

  if (existing) {
    const patchResp = await fetch(`${apiBase}/issues/comments/${existing.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ body }),
    });
    if (!patchResp.ok) {
      throw new Error(`Failed to update PR comment: ${patchResp.status} ${patchResp.statusText}`);
    }
  } else {
    const postResp = await fetch(`${apiBase}/issues/${prNumber}/comments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ body }),
    });
    if (!postResp.ok) {
      throw new Error(`Failed to post PR comment: ${postResp.status} ${postResp.statusText}`);
    }
  }
}

async function getChangedFiles(): Promise<string[] | null> {
  const ctx = github.context;
  if (ctx.eventName !== 'pull_request') return null;

  const token = process.env['GITHUB_TOKEN'];
  if (!token) {
    core.warning('GITHUB_TOKEN not set — falling back to full scan');
    return null;
  }

  const octokit = github.getOctokit(token);
  const pr = ctx.payload.pull_request as unknown as { base: { sha: string }; head: { sha: string } };

  const { data } = await octokit.rest.repos.compareCommitsWithBasehead({
    owner: ctx.repo.owner,
    repo: ctx.repo.repo,
    basehead: `${pr.base.sha}...${pr.head.sha}`,
  });

  return (data.files ?? [])
    .map((f) => f.filename)
    .filter((f) => getParserForFile(f) !== undefined);
}

async function postMetrics(violations: Violation[]): Promise<void> {
  const apiUrl = process.env['uiseal_API_URL'];
  const token = process.env['uiseal_TOKEN'];

  if (!apiUrl) {
    core.warning('uiseal_API_URL not set — skipping report');
    return;
  }

  const countsByRule: Record<string, number> = {};
  for (const v of violations) {
    countsByRule[v.ruleId] = (countsByRule[v.ruleId] ?? 0) + 1;
  }

  const { owner, repo } = github.context.repo;
  const repoId = crypto
    .createHash('sha256')
    .update(`${owner}/${repo}`)
    .digest('hex')
    .slice(0, 16);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ repoId, timestamp: new Date().toISOString(), counts: countsByRule }),
  });
}

async function runPrReview(configInput: string, reportEnabled: boolean): Promise<void> {
  const configDir = path.dirname(path.resolve(configInput));
  const { config } = await loadConfig(configDir);

  const baseRef = process.env['GITHUB_BASE_REF'];
  if (!baseRef) throw new Error('GITHUB_BASE_REF not set');

  // Scan HEAD — GitHub already checks out the merge commit on pull_request events.
  core.info('UISeal: scanning HEAD…');
  const headFilePaths = await glob(buildGlob(), { ignore: config.ignore });
  const headSnapshots = await collectSnapshots(headFilePaths, config);
  core.info(`UISeal: HEAD — ${headFilePaths.length} file(s), ${headSnapshots.length} violation(s)`);

  // Scan BASE by temporarily overlaying base files, then restoring.
  let baseSnapshots: ViolationSnapshot[] = [];
  try {
    core.info(`UISeal: fetching base '${baseRef}'…`);
    execSync(`git fetch origin ${baseRef} --depth=1`, { stdio: 'pipe' });
    execSync('git checkout FETCH_HEAD -- .', { stdio: 'pipe' });
    const baseFilePaths = await glob(buildGlob(), { ignore: config.ignore });
    baseSnapshots = await collectSnapshots(baseFilePaths, config);
    core.info(`UISeal: BASE — ${baseFilePaths.length} file(s), ${baseSnapshots.length} violation(s)`);
  } finally {
    execSync('git checkout HEAD -- .', { stdio: 'pipe' });
    core.info('UISeal: restored HEAD files');
  }

  const diff = diffScans(baseSnapshots, headSnapshots);
  const markdown = formatDiffAsMarkdown(diff);

  // Post or update PR comment. Requires pull-requests: write permission.
  const token = core.getInput('token') || process.env['GITHUB_TOKEN'];
  if (token) {
    try {
      const prNumber = getPrNumber();
      const [owner, repo] = (process.env['GITHUB_REPOSITORY'] ?? '/').split('/');
      await postOrUpdatePrComment(token, owner!, repo!, prNumber, markdown);
      core.info('UISeal: PR comment posted/updated');
    } catch (err) {
      core.warning(
        `UISeal: could not post PR comment — ${err instanceof Error ? err.message : String(err)}. ` +
          'Ensure the job has pull-requests: write permission.',
      );
    }
  } else {
    core.warning('GITHUB_TOKEN not set — skipping PR comment');
  }

  if (reportEnabled) {
    const headViolations: Violation[] = headSnapshots.map(s => ({
      ruleId: s.ruleId,
      severity: s.severity,
      message: s.message,
      file: s.file,
      line: s.line,
      column: s.column,
      ...(s.fix ? { fix: s.fix } : {}),
    }));
    await postMetrics(headViolations);
  }

  core.setOutput('verdict', diff.verdict);
  core.setOutput('new-violations', diff.newCount.toString());
  core.setOutput('fixed-violations', diff.fixedCount.toString());

  if (diff.verdict === 'blocking') {
    core.setFailed('UISeal: blocking violations found. See PR comment for details.');
  } else {
    core.info(`UISeal: ${diff.verdict}. See PR comment for details.`);
  }
}

export async function run(): Promise<void> {
  const configInput = core.getInput('config') || 'uiseal.config.ts';
  const reportEnabled = core.getInput('report') === 'true';

  if (process.env['GITHUB_EVENT_NAME'] === 'pull_request') {
    await runPrReview(configInput, reportEnabled);
    return;
  }

  // Non-PR path: full/changed-files scan with inline annotations.
  const configDir = path.dirname(path.resolve(configInput));
  const { config } = await loadConfig(configDir);

  let filePaths: string[];
  const changedFiles = await getChangedFiles();

  if (changedFiles !== null) {
    filePaths = changedFiles;
    core.info(`Checking ${filePaths.length} changed file(s) from PR`);
  } else {
    filePaths = await glob(buildGlob(), { ignore: config.ignore });
    core.info(`Full scan: ${filePaths.length} file(s)`);
  }

  const files = new Map<string, string>();
  for (const fp of filePaths) {
    const abs = path.resolve(fp);
    if (fs.existsSync(abs)) {
      files.set(abs, fs.readFileSync(abs, 'utf8'));
    }
  }

  const { violations } = await analyze({ files, config, rules: allRules });

  for (const v of violations) {
    const msg = v.fix?.suggested
      ? `[${v.ruleId}] ${v.message} — suggested fix: ${v.fix.suggested}`
      : `[${v.ruleId}] ${v.message}`;

    const props = { file: v.file, startLine: v.line, endLine: v.line };

    if (v.severity === 'error') {
      core.error(msg, props);
    } else {
      core.warning(msg, props);
    }
  }

  if (reportEnabled) {
    await postMetrics(violations);
  }

  const errorCount = violations.filter((v) => v.severity === 'error').length;
  if (errorCount > 0) {
    core.setFailed(`uiseal: ${errorCount} error violation(s) found`);
  }
}

// Auto-run only inside GitHub Actions, not during tests or local imports.
if (process.env['GITHUB_ACTIONS']) {
  run().catch((err) => {
    core.setFailed(`uiseal action: ${err instanceof Error ? err.message : String(err)}`);
  });
}
