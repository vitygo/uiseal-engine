import { Command } from 'commander';
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import {
  loadConfig,
  analyze,
  allRules,
  diffScans,
  formatDiffAsMarkdown,
} from '@uiseal/core';
import type { ViolationSnapshot, DiffResult } from '@uiseal/core';
import type { Violation, uisealConfig } from '@uiseal/core';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';

function red(s: string): string { return RED + s + RESET; }
function yellow(s: string): string { return YELLOW + s + RESET; }
function green(s: string): string { return GREEN + s + RESET; }
function bold(s: string): string { return BOLD + s + RESET; }
function dim(s: string): string { return DIM + s + RESET; }
function cyan(s: string): string { return CYAN + s + RESET; }

const categoryMap = new Map(allRules.map((r) => [r.id, r.category] as const));

function violationToSnapshot(v: Violation): ViolationSnapshot {
  return {
    ruleId: v.ruleId,
    file: v.file,
    line: v.line,
    column: v.column,
    message: v.message,
    severity: v.severity,
    category: categoryMap.get(v.ruleId) ?? 'quality',
    fix: v.fix,
  };
}

async function scanFiles(projectRoot: string, config: uisealConfig): Promise<ViolationSnapshot[]> {
  const filePaths = await glob('**/*.{tsx,jsx,css,module.css}', {
    cwd: projectRoot,
    ignore: ['**/node_modules/**', ...config.ignore],
    absolute: true,
  });

  const files = new Map<string, string>();
  for (const fp of filePaths) {
    if (fs.existsSync(fp)) {
      files.set(fp, fs.readFileSync(fp, 'utf8'));
    }
  }

  const { violations } = await analyze({ files, config, rules: allRules });
  return violations.map(violationToSnapshot);
}

function relPath(file: string): string {
  const rel = path.relative(process.cwd(), file);
  return rel.startsWith('..') ? file : rel;
}

function netChangeLabel(netChange: number): string {
  if (netChange > 0) return red(`net: +${netChange} ↑ worse`);
  if (netChange < 0) return green(`net: ${netChange} ↓ better`);
  return dim('net: no change');
}

const SHOW_MAX = 4;

function formatTerminalDiff(diff: DiffResult, base: string): string {
  const lines: string[] = [];

  const title = `  🦭 UISeal Diff: HEAD vs ${base}  `;
  const border = '─'.repeat(title.length);
  lines.push(bold(`┌${border}┐`));
  lines.push(bold(`│${title}│`));
  lines.push(bold(`└${border}┘`));
  lines.push('');

  const verdictStr =
    diff.verdict === 'blocking'
      ? red('🚫 Blocking')
      : diff.verdict === 'needs-attention'
        ? yellow('⚠️  Needs attention')
        : green('✅ Looks good');
  lines.push(`Verdict: ${bold(verdictStr)}`);
  lines.push('');

  if (diff.blocking.length > 0) {
    lines.push(bold(red(`Blocking (${diff.blocking.length} must fix):`)));
    for (const v of diff.blocking.slice(0, SHOW_MAX)) {
      lines.push(`  ${cyan(relPath(v.file))}:${dim(String(v.line))}  ${dim(v.ruleId)}`);
      lines.push(`  ${dim('→')} ${v.message}`);
    }
    if (diff.blocking.length > SHOW_MAX) {
      lines.push(dim(`  (+ ${diff.blocking.length - SHOW_MAX} more)`));
    }
    lines.push('');
  }

  if (diff.warnings.length > 0) {
    lines.push(bold(yellow(`Warnings (${diff.warnings.length}):`)));
    for (const v of diff.warnings.slice(0, SHOW_MAX)) {
      lines.push(`  ${cyan(relPath(v.file))}:${dim(String(v.line))}  ${dim(v.ruleId)}`);
      lines.push(`  ${dim('→')} ${v.message}`);
    }
    if (diff.warnings.length > SHOW_MAX) {
      lines.push(dim(`  (+ ${diff.warnings.length - SHOW_MAX} more)`));
    }
    lines.push('');
  }

  const impactParts: string[] = [];
  if (diff.newCount > 0) impactParts.push(`+${diff.newCount} added`);
  if (diff.fixedCount > 0) impactParts.push(`-${diff.fixedCount} fixed`);
  lines.push(bold('Impact:'));
  lines.push(`  ${[...impactParts, netChangeLabel(diff.netChange)].join('  ')}`);
  lines.push('');

  const topFiles = diff.fileImpact.slice(0, 5);
  if (topFiles.length > 0) {
    lines.push(bold('Files most affected:'));
    for (const f of topFiles) {
      const deltaStr = f.delta > 0 ? red(`+${f.delta}`) : green(`${f.delta}`);
      lines.push(`  ${relPath(f.file).padEnd(40)}  ${deltaStr}`);
    }
    lines.push('');
  }

  if (diff.autoFixableCount > 0) {
    lines.push(
      `Auto-fixable: ${bold(String(diff.autoFixableCount))} violation${diff.autoFixableCount !== 1 ? 's' : ''}`,
    );
    lines.push(`Run: ${dim('uiseal check --fix')}`);
    lines.push('');
  }

  if (diff.securityIssuesFound > 0) {
    lines.push(
      red(
        `⚠  ${diff.securityIssuesFound} new security issue${diff.securityIssuesFound !== 1 ? 's' : ''} — review before merging`,
      ),
    );
    lines.push('');
  }

  return lines.join('\n');
}

export const diffCommand = new Command('diff')
  .description('Compare HEAD against a base branch and print a PR review summary')
  .argument('[base]', 'git ref to compare against', 'main')
  .option('--markdown', 'Output markdown instead of terminal summary')
  .action(async (base: string, opts: { markdown?: boolean }) => {
    // 1. Verify git repo
    try {
      execSync('git rev-parse --git-dir', { stdio: 'ignore' });
    } catch {
      process.stderr.write('Not a git repository\n');
      process.exit(1);
    }

    // 2. Load config
    let config: uisealConfig;
    let projectRoot: string;
    try {
      const result = await loadConfig(process.cwd());
      config = result.config;
      projectRoot = result.projectRoot;
    } catch (err) {
      process.stderr.write(`Error loading config: ${(err as Error).message}\n`);
      process.exit(1);
      return;
    }

    // 3. Scan HEAD
    process.stderr.write('Scanning HEAD...\n');
    let headViolations: ViolationSnapshot[];
    try {
      headViolations = await scanFiles(projectRoot, config);
    } catch (err) {
      process.stderr.write(`Error scanning HEAD: ${(err as Error).message}\n`);
      process.exit(1);
      return;
    }

    // 4. Scan BASE branch using try/finally to always restore git state
    let baseViolations: ViolationSnapshot[] | undefined;
    let stashed = false;
    let scanError: Error | undefined;

    try {
      const stashOut = execSync('git stash --include-untracked', { encoding: 'utf8' }).trim();
      stashed = !stashOut.startsWith('No local changes to save');

      process.stderr.write(`Checking out ${base}...\n`);
      spawnSync('git', ['checkout', base], { stdio: 'ignore' });

      process.stderr.write(`Scanning ${base}...\n`);
      baseViolations = await scanFiles(projectRoot, config);
    } catch (err) {
      scanError = err as Error;
    } finally {
      try {
        execSync('git checkout -', { stdio: 'ignore' });
      } catch (restoreErr) {
        process.stderr.write(`Warning: failed to restore branch: ${(restoreErr as Error).message}\n`);
      }
      if (stashed) {
        try {
          execSync('git stash pop', { stdio: 'ignore' });
        } catch (popErr) {
          process.stderr.write(`Warning: failed to restore stash: ${(popErr as Error).message}\n`);
        }
      }
    }

    if (scanError) {
      process.stderr.write(`Git operation failed: ${scanError.message}\n`);
      process.exit(1);
    }

    // 5. Diff
    const diff = diffScans(baseViolations!, headViolations);

    // 6. Output
    if (opts.markdown) {
      process.stdout.write(formatDiffAsMarkdown(diff) + '\n');
    } else {
      process.stdout.write(formatTerminalDiff(diff, base) + '\n');
    }

    // 7. Exit code: 1 if blocking, 0 otherwise
    process.exit(diff.verdict === 'blocking' ? 1 : 0);
  });
