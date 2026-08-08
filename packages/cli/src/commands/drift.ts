import { Command } from 'commander';
import path from 'node:path';
import { analyzeDrift, formatDriftReport, formatDriftJson, getAllSources } from '@uiseal/core';

// Exit 1 once drift crosses this — hardcoded for v1, per the task; a
// configurable threshold is a natural follow-up once real usage shows what
// projects actually want here.
const DRIFT_FAIL_THRESHOLD = 10;

export const driftCommand = new Command('drift')
  .description('Compare the live token source against the code and report drift')
  .argument('[path]', 'Directory to scan (defaults to cwd)')
  .option(
    '--source <id>',
    `Token source: ${getAllSources()
      .map((s) => s.id)
      .join(' | ')} (default: auto-detect)`,
  )
  .option('-c, --config <dir>', 'Directory to resolve the project from')
  .option('--json', 'Output the drift report as JSON (for CI/scripting)')
  .option('--verbose', 'Show every drifted value, not just the top ones')
  .action(async (
    scanPath: string | undefined,
    opts: { source?: string; config?: string; json?: boolean; verbose?: boolean },
  ) => {
    const cwd = opts.config
      ? path.resolve(opts.config)
      : scanPath
        ? path.resolve(scanPath)
        : process.cwd();

    let report;
    try {
      report = await analyzeDrift({ cwd, sourceId: opts.source });
    } catch (err) {
      process.stderr.write(`Error: ${(err as Error).message}\n`);
      process.exitCode = 2;
      return;
    }

    if (opts.json) {
      process.stdout.write(formatDriftJson(report) + '\n');
    } else {
      process.stdout.write(formatDriftReport(report, { verbose: opts.verbose }) + '\n');
    }

    // Use exitCode rather than process.exit() so Node.js drains stdout
    // before terminating — large reports would otherwise lose the tail.
    process.exitCode = report.summary.driftPercentage >= DRIFT_FAIL_THRESHOLD ? 1 : 0;
  });
