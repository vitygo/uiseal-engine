import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { glob } from 'glob';
import {
  loadConfig,
  analyze,
  formatReport,
  allRules,
  fingerprintViolations,
  writeBaseline,
  resolveBaselineResult,
  setBaselineEnabled,
  fetchAppConfig,
} from '@uiseal/core';
import type { Violation, BaselineState } from '@uiseal/core';

const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';

export interface CheckOptions {
  configDir?: string;
  staged?: boolean;
  report?: boolean;
  scanPath?: string;
  updateBaseline?: boolean;
  noBaseline?: boolean;
  verbose?: boolean;
}

export interface CheckResult {
  violations: Violation[];
  hasErrors: boolean;
  baseline: BaselineState;
  newViolations?: Violation[];
  allViolations?: Violation[];
  baselineCount?: number;
}

export async function runCheck(opts: CheckOptions): Promise<CheckResult> {
  // Derive the config search start: explicit -c dir, then scan path, then cwd.
  const searchFrom = opts.configDir
    ? path.resolve(opts.configDir)
    : opts.scanPath
      ? path.resolve(opts.scanPath)
      : process.cwd();

  const { config, projectRoot } = await loadConfig(searchFrom);

  let filePaths: string[];

  if (opts.staged) {
    const output = execSync('git diff --name-only --cached', { encoding: 'utf8' });
    filePaths = output
      .split('\n')
      .map((f) => f.trim())
      .filter((f) => /\.(tsx|jsx|css)$/.test(f));
  } else {
    const base = opts.scanPath ? path.resolve(opts.scanPath) : projectRoot;
    const isFile = fs.existsSync(base) && fs.statSync(base).isFile();
    if (isFile) {
      filePaths = /\.(tsx|jsx|css)$/.test(base) ? [base] : [];
    } else {
      filePaths = await glob('**/*.{tsx,jsx,css,module.css}', {
        cwd: base,
        ignore: ['**/node_modules/**', ...config.ignore],
        absolute: true,
      });
    }
  }

  const files = new Map<string, string>();
  for (const fp of filePaths) {
    const abs = path.resolve(fp);
    if (fs.existsSync(abs)) {
      files.set(abs, fs.readFileSync(abs, 'utf8'));
    }
  }

  process.stdout.write(`Scanned ${files.size} files\n`);

  const { violations: rawViolations } = await analyze({ files, config, rules: allRules });
  const resolvedBaselinePath = path.resolve(projectRoot, config.baseline.path);

  // --update-baseline: write all current violations as the new baseline, exit 0.
  if (opts.updateBaseline) {
    const fv = fingerprintViolations(rawViolations, projectRoot);
    writeBaseline(resolvedBaselinePath, fv, projectRoot);
    process.stdout.write(`Stored ${fv.length} fingerprints in ${resolvedBaselinePath}\n`);

    // Also set baseline.enabled = true so the next plain `check` filters automatically.
    const updated = setBaselineEnabled(projectRoot, true);
    if (updated) {
      process.stdout.write('baseline enabled in uiseal.config.json\n');
    } else {
      process.stdout.write('Note: set baseline.enabled = true manually in your config (JSON config not found)\n');
    }

    const noopBaseline: BaselineState = {
      status: 'active',
      resolvedPath: resolvedBaselinePath,
      counts: { total: fv.length, baselined: fv.length, new: 0, resolved: 0, baselineTotal: fv.length },
    };
    return { violations: [], hasErrors: false, baseline: noopBaseline };
  }

  // --no-baseline: ignore baseline entirely and report everything.
  if (opts.noBaseline) {
    process.stdout.write(formatReport(rawViolations, { verbose: opts.verbose }));
    if (opts.report) await postMetrics(rawViolations);
    await printAppConfigBanner(projectRoot);
    const total = rawViolations.length;
    const noBaseline: BaselineState = {
      status: 'disabled',
      resolvedPath: resolvedBaselinePath,
      counts: { total, baselined: 0, new: total, resolved: 0, baselineTotal: 0 },
    };
    return {
      violations: rawViolations,
      hasErrors: rawViolations.some((v) => v.severity === 'error'),
      baseline: noBaseline,
    };
  }

  const { violations, baseline } = resolveBaselineResult(rawViolations, config, projectRoot);

  if (baseline.status === 'disabled') {
    process.stdout.write('baseline: disabled (run check --update-baseline to freeze current debt)\n');
  } else if (baseline.status === 'file-missing') {
    process.stdout.write(`baseline: file not found at ${baseline.resolvedPath} — run check --update-baseline first\n`);
  } else {
    const { baselined, new: newCount, resolved, baselineTotal } = baseline.counts;
    process.stdout.write(
      `Design debt: ${baselineTotal} -> ${baselined} (${resolved} fixed) · ${newCount} new\n`,
    );
    if (resolved > 0) {
      process.stdout.write(`Run \`uiseal baseline prune\` to bank the ${resolved} fixed issue${resolved === 1 ? '' : 's'}.\n`);
    }
  }

  process.stdout.write(formatReport(violations, { verbose: opts.verbose }));
  if (opts.report) await postMetrics(violations);
  await printAppConfigBanner(projectRoot);

  return {
    violations,
    hasErrors: violations.some((v) => v.severity === 'error'),
    baseline,
  };
}

async function printAppConfigBanner(projectRoot: string): Promise<void> {
  // Only ping the server if the user has opted in via a token or explicit banner flag.
  // This keeps uiseal fully offline by default for users on the free tier.
  if (!process.env['UISEAL_TOKEN'] && process.env['UISEAL_SHOW_BANNER'] !== '1') return;

  const apiUrl = process.env['UISEAL_API_URL'] ?? 'https://api.uiseal.io';
  const appConfig = await fetchAppConfig(apiUrl, projectRoot);

  if (appConfig.bannerActive && appConfig.bannerText) {
    let color: string;
    if (appConfig.bannerType === 'warning') color = YELLOW;
    else if (appConfig.bannerType === 'success') color = GREEN;
    else color = CYAN;
    process.stdout.write(`${color}ℹ ${appConfig.bannerText}${RESET}\n`);
  } else if (appConfig.betaMode) {
    process.stdout.write(`${DIM}Running in beta — see uiseal.io for updates${RESET}\n`);
  }
}

async function postMetrics(violations: Violation[]): Promise<void> {
  const apiUrl = process.env['uiseal_API_URL'];
  const token = process.env['uiseal_TOKEN'];

  if (!apiUrl) {
    process.stderr.write('Warning: uiseal_API_URL not set, skipping report\n');
    return;
  }

  const countsByRule: Record<string, number> = {};
  for (const v of violations) {
    countsByRule[v.ruleId] = (countsByRule[v.ruleId] ?? 0) + 1;
  }

  const repoId = crypto
    .createHash('sha256')
    .update(process.cwd())
    .digest('hex')
    .slice(0, 16);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  process.stderr.write(`Posting metrics to: ${apiUrl}\n`);

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        repo: repoId,
        timestamp: Math.floor(Date.now() / 1000),
        counts: countsByRule,
      }),
    });

    if (res.ok) {
      process.stderr.write(`Metrics sent successfully: ${res.status}\n`);
    } else {
      const body = await res.text();
      process.stderr.write(`Metrics failed: ${res.status} ${body}\n`);
    }
  } catch (err) {
    process.stderr.write(`Metrics network error: ${err instanceof Error ? err.message : String(err)}\n`);
  }
}
