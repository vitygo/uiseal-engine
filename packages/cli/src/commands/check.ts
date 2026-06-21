import { Command } from 'commander';
import { runCheck } from '../check-runner.js';

export const checkCommand = new Command('check')
  .description('Check source files for design-system violations')
  .argument('[path]', 'File or folder to scan (defaults to cwd)')
  .option('-c, --config <dir>', 'Directory containing uiseal.config.{ts,js,json}')
  .option('--staged', 'Only check files staged in git (pre-commit use case)')
  .option('--report', 'POST aggregated metrics to uiseal_API_URL')
  .option('--update-baseline', 'Scan, write all current violations to the baseline file, exit 0')
  .option('--no-baseline', 'Ignore the baseline entirely and report all violations')
  .action(async (
    scanPath: string | undefined,
    opts: { config?: string; staged?: boolean; report?: boolean; updateBaseline?: boolean; baseline?: boolean },
  ) => {
    try {
      const { hasErrors } = await runCheck({
        configDir: opts.config,
        staged: opts.staged,
        report: opts.report,
        scanPath,
        updateBaseline: opts.updateBaseline,
        // Commander turns --no-baseline into baseline=false.
        noBaseline: opts.baseline === false,
      });
      process.exit(hasErrors ? 1 : 0);
    } catch (err) {
      process.stderr.write(`Error: ${(err as Error).message}\n`);
      process.exit(2);
    }
  });
