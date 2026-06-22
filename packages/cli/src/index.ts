import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { program } from 'commander';
import { version } from '@uiseal/core';
import { checkCommand } from './commands/check.js';
import { initCommand } from './commands/init.js';
import { installHooksCommand } from './commands/install-hooks.js';
import { baselineCommand } from './commands/baseline.js';
import { diffCommand } from './commands/diff.js';
import React from 'react';
import { render } from 'ink';
import App from './tui/App.js';

if (!process.env.CI) {
  loadDotenv({ path: resolve(process.cwd(), '.env'), quiet: true });
}

const isInteractive =
  process.stdin.isTTY === true &&
  process.stdout.isTTY === true &&
  process.argv.length <= 2;

if (isInteractive) {
  // Loop so that setup commands (init, install-hooks) can return to the TUI.
  while (true) {
    let pendingCommand: string[] | null = null;

    const { waitUntilExit } = render(
      React.createElement(App, {
        onLaunchCommand: (args: string[]) => {
          pendingCommand = args;
        },
      }),
    );

    await waitUntilExit();

    if (!pendingCommand) break; // user pressed q / Ctrl-C

    const cmd = (pendingCommand as string[])[0] ?? '';
    const isSetupCmd = cmd === 'init' || cmd === 'install-hooks';

    const proc = spawn(process.execPath, [process.argv[1]!, ...(pendingCommand as string[])], {
      stdio: 'inherit',
    });

    if (isSetupCmd) {
      await new Promise<void>((res) => proc.on('exit', () => res()));
      process.stdout.write('\nPress any key to restart UISeal… ');
      if ((process.stdin as NodeJS.ReadStream).isTTY) {
        (process.stdin as NodeJS.ReadStream).setRawMode(true);
      }
      process.stdin.resume();
      await new Promise<void>((res) => process.stdin.once('data', () => res()));
      if ((process.stdin as NodeJS.ReadStream).isTTY) {
        (process.stdin as NodeJS.ReadStream).setRawMode(false);
      }
      process.stdin.pause();
      process.stdout.write('\n');
      // Loop restarts, re-rendering the TUI
    } else {
      // Non-setup command launched externally — wait and exit
      await new Promise<void>((res) =>
        proc.on('exit', (code) => {
          process.exitCode = code ?? 0;
          res();
        }),
      );
      break;
    }
  }
} else {
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
}
