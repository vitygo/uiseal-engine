import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { formatSarif, version } from '@uiseal/core';
import type { Violation } from '@uiseal/core';
import { runCheck, type CheckFormat } from '../check-runner.js';

const VALID_FORMATS: CheckFormat[] = ['pretty', 'json', 'sarif'];

function buildJsonOutput(violations: Violation[], filesScanned: number): string {
  const errors = violations.filter((v) => v.severity === 'error').length;
  const warnings = violations.filter((v) => v.severity === 'warning').length;
  const fixable = violations.filter((v) => v.fix?.suggested).length;

  return JSON.stringify(
    {
      violations,
      summary: { total: violations.length, errors, warnings, fixable, filesScanned },
    },
    null,
    2,
  );
}

export const checkCommand = new Command('check')
  .description('Check source files for design-system violations')
  .argument('[path]', 'File or folder to scan (defaults to cwd)')
  .option('-c, --config <dir>', 'Directory containing uiseal.config.{ts,js,json}')
  .option('--staged', 'Only check files staged in git (pre-commit use case)')
  .option('--report', 'POST aggregated metrics to uiseal_API_URL')
  .option('--update-baseline', 'Scan, write all current violations to the baseline file, exit 0')
  .option('--no-baseline', 'Ignore the baseline entirely and report all violations')
  .option('--verbose', 'Show full verbose output even when violation count exceeds 50')
  .option('--fix', 'Apply suggested fixes to source files')
  .option('--dry-run', 'Show what --fix would change without writing any files')
  .option('--format <format>', 'Output format: pretty | json | sarif (default: pretty)', 'pretty')
  .option('--output <file>', 'Write output to a file instead of stdout')
  .action(async (
    scanPath: string | undefined,
    opts: {
      config?: string;
      staged?: boolean;
      report?: boolean;
      updateBaseline?: boolean;
      baseline?: boolean;
      verbose?: boolean;
      fix?: boolean;
      dryRun?: boolean;
      format: string;
      output?: string;
    },
  ) => {
    const format = opts.format as CheckFormat;
    if (!VALID_FORMATS.includes(format)) {
      process.stderr.write(`Error: invalid --format "${opts.format}" (expected pretty, json, or sarif)\n`);
      process.exitCode = 2;
      return;
    }

    try {
      const result = await runCheck({
        configDir: opts.config,
        staged: opts.staged,
        report: opts.report,
        scanPath,
        updateBaseline: opts.updateBaseline,
        // Commander turns --no-baseline into baseline=false.
        noBaseline: opts.baseline === false,
        verbose: opts.verbose,
        fix: opts.fix,
        dryRun: opts.dryRun,
        format,
        captureOutput: format !== 'pretty' || Boolean(opts.output),
      });

      let primary: string;
      if (format === 'json') {
        primary = buildJsonOutput(result.violations, result.filesScanned);
      } else if (format === 'sarif') {
        primary = formatSarif(result.violations, { cwd: result.projectRoot, version });
      } else {
        primary = result.report ?? '';
      }

      if (opts.output) {
        fs.writeFileSync(path.resolve(opts.output), primary.endsWith('\n') ? primary : `${primary}\n`);
      } else if (format !== 'pretty') {
        process.stdout.write(`${primary}\n`);
      }
      // format === 'pretty' && !opts.output: runCheck already wrote directly to stdout.

      // Use exitCode rather than process.exit() so Node.js drains stdout before
      // terminating — large reports would otherwise lose the trailing summary.
      process.exitCode = result.hasErrors ? 1 : 0;
    } catch (err) {
      process.stderr.write(`Error: ${(err as Error).message}\n`);
      process.exit(2);
    }
  });
