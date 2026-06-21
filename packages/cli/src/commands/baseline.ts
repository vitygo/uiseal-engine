import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import {
  loadConfig,
  analyze,
  allRules,
  fingerprintViolations,
  writeBaseline,
  pruneBaseline,
  setBaselineEnabled,
  readBaselineEntries,
  resolveBaselineResult,
} from '@uiseal/core';

// Always exclude these when scanning for baseline operations.
const IGNORE = ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**', '**/*.min.css'];

async function scanFiles(projectRoot: string, configIgnore: string[]): Promise<Map<string, string>> {
  const paths = await glob('**/*.{tsx,jsx,css,module.css}', {
    cwd: projectRoot,
    ignore: [...IGNORE, ...configIgnore],
    absolute: true,
  });
  const files = new Map<string, string>();
  for (const p of paths) {
    if (fs.existsSync(p)) files.set(p, fs.readFileSync(p, 'utf8'));
  }
  return files;
}

export const baselineCommand = new Command('baseline')
  .description('Manage the design-debt baseline');

baselineCommand
  .command('update')
  .description('Rescan and rewrite the baseline (same as check --update-baseline)')
  .option('-c, --config <dir>', 'Directory containing uiseal config')
  .action(async (opts: { config?: string }) => {
    try {
      const searchFrom = opts.config ? path.resolve(opts.config) : process.cwd();
      const { config, projectRoot } = await loadConfig(searchFrom);
      const resolvedBaselinePath = path.resolve(projectRoot, config.baseline.path);

      const files = await scanFiles(projectRoot, config.ignore);
      process.stdout.write(`Scanned ${files.size} files\n`);

      const raw = analyze({ files, config, rules: allRules });
      const fv = fingerprintViolations(raw, projectRoot);
      writeBaseline(resolvedBaselinePath, fv, projectRoot);
      process.stdout.write(`Stored ${fv.length} fingerprints in ${resolvedBaselinePath}\n`);

      const updated = setBaselineEnabled(projectRoot, true);
      if (updated) {
        process.stdout.write('baseline enabled in uiseal.config.json\n');
      } else {
        process.stdout.write('Note: set baseline.enabled = true manually in your config (JSON config not found)\n');
      }

      process.exit(0);
    } catch (err) {
      process.stderr.write(`Error: ${(err as Error).message}\n`);
      process.exit(2);
    }
  });

baselineCommand
  .command('disable')
  .description('Set baseline.enabled = false in uiseal.config.json')
  .option('-c, --config <dir>', 'Directory containing uiseal config')
  .action(async (opts: { config?: string }) => {
    try {
      const searchFrom = opts.config ? path.resolve(opts.config) : process.cwd();
      const { projectRoot } = await loadConfig(searchFrom);
      const updated = setBaselineEnabled(projectRoot, false);
      if (updated) {
        process.stdout.write('baseline disabled in uiseal.config.json\n');
      } else {
        process.stdout.write('Note: set baseline.enabled = false manually in your config (JSON config not found)\n');
      }
      process.exit(0);
    } catch (err) {
      process.stderr.write(`Error: ${(err as Error).message}\n`);
      process.exit(2);
    }
  });

baselineCommand
  .command('status')
  .description('Print baseline path, enabled state, and debt counts')
  .option('-c, --config <dir>', 'Directory containing uiseal config')
  .action(async (opts: { config?: string }) => {
    try {
      const searchFrom = opts.config ? path.resolve(opts.config) : process.cwd();
      const { config, projectRoot } = await loadConfig(searchFrom);
      const resolvedBaselinePath = path.resolve(projectRoot, config.baseline.path);

      process.stdout.write(`Baseline path : ${resolvedBaselinePath}\n`);
      process.stdout.write(`Enabled       : ${config.baseline.enabled}\n`);

      if (!fs.existsSync(resolvedBaselinePath)) {
        process.stdout.write('Status        : file not found — run `uiseal baseline update` first\n');
        process.exit(0);
        return;
      }

      const entries = readBaselineEntries(resolvedBaselinePath);
      process.stdout.write(`Snapshot size : ${entries.length} fingerprints\n`);

      if (config.baseline.enabled) {
        const files = await scanFiles(projectRoot, config.ignore);
        const raw = analyze({ files, config, rules: allRules });
        const { baseline } = resolveBaselineResult(raw, config, projectRoot);
        const { baselined, new: newCount, resolved } = baseline.counts;
        process.stdout.write(`Frozen        : ${baselined}\n`);
        process.stdout.write(`New           : ${newCount}\n`);
        process.stdout.write(`Resolved      : ${resolved}\n`);
        if (resolved > 0) {
          process.stdout.write(`Hint          : run \`uiseal baseline prune\` to bank ${resolved} fixed issue${resolved === 1 ? '' : 's'}\n`);
        }
      }

      process.exit(0);
    } catch (err) {
      process.stderr.write(`Error: ${(err as Error).message}\n`);
      process.exit(2);
    }
  });

baselineCommand
  .command('prune')
  .description('Remove fingerprints that no longer match current code (fixed issues)')
  .option('-c, --config <dir>', 'Directory containing uiseal config')
  .action(async (opts: { config?: string }) => {
    try {
      const searchFrom = opts.config ? path.resolve(opts.config) : process.cwd();
      const { config, projectRoot } = await loadConfig(searchFrom);
      const resolvedBaselinePath = path.resolve(projectRoot, config.baseline.path);

      if (!fs.existsSync(resolvedBaselinePath)) {
        process.stdout.write(`Baseline file not found at ${resolvedBaselinePath} — nothing to prune\n`);
        process.exit(0);
        return;
      }

      const files = await scanFiles(projectRoot, config.ignore);
      process.stdout.write(`Scanned ${files.size} files\n`);

      const raw = analyze({ files, config, rules: allRules });
      const { pruned, remaining } = pruneBaseline(resolvedBaselinePath, raw, projectRoot);

      if (pruned === 0) {
        process.stdout.write('Nothing to prune — all baseline fingerprints are still present\n');
      } else {
        process.stdout.write(`Pruned ${pruned} resolved fingerprint${pruned === 1 ? '' : 's'} — ${remaining} remaining\n`);
      }

      process.exit(0);
    } catch (err) {
      process.stderr.write(`Error: ${(err as Error).message}\n`);
      process.exit(2);
    }
  });
