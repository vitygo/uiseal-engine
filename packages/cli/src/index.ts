import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { program } from 'commander';
import { version } from '@uiseal/core';

if (!process.env.CI) {
  loadDotenv({ path: resolve(process.cwd(), '.env'), quiet: true });
}
import { checkCommand } from './commands/check.js';
import { initCommand } from './commands/init.js';
import { installHooksCommand } from './commands/install-hooks.js';
import { baselineCommand } from './commands/baseline.js';
import { diffCommand } from './commands/diff.js';

program
  .name('uiseal')
  .description('Deterministic design-system governance for human and AI-generated code')
  .version(version);

program.addCommand(checkCommand);
program.addCommand(initCommand);
program.addCommand(installHooksCommand);
program.addCommand(baselineCommand);
program.addCommand(diffCommand);

program.parse();
