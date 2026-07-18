import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { program } from 'commander';
import { version } from '@uiseal/core';
import { checkCommand } from './commands/check.js';
import { initCommand } from './commands/init.js';
import { installHooksCommand } from './commands/install-hooks.js';
import { baselineCommand } from './commands/baseline.js';
import { diffCommand } from './commands/diff.js';
import { driftCommand } from './commands/drift.js';
import { watchCommand } from './commands/watch.js';
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

// Safety gate: --fix writes to source files, so it must only ever run through
// the non-interactive commander dispatch below (uiseal check --fix), never
// from a bare `uiseal --fix` in a TTY session where the interactive picker
// would otherwise take over.
const topLevelArgs = process.argv.slice(2);
const knownCommands = ['check', 'init', 'install-hooks', 'baseline', 'diff', 'drift', 'watch'];
const hasKnownCommand = topLevelArgs.some((a) => knownCommands.includes(a));
const requestedFix = topLevelArgs.includes('--fix') || topLevelArgs.includes('--dry-run');

if (!hasKnownCommand && requestedFix && process.stdin.isTTY === true && process.stdout.isTTY === true) {
  process.stdout.write('Fix mode requires non-interactive usage: uiseal check --fix\n');
  process.exitCode = 1;
} else if (isInteractive) {
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
    // 'check' only reaches here via the command palette (with args/flags the
    // in-TUI Scanning screen can't run) — loop back into the TUI afterward,
    // same as the other setup/one-shot commands, instead of exiting.
    const isSetupCmd =
      cmd === 'init' || cmd === 'install-hooks' || cmd === 'watch' || cmd === 'check';

    const proc = spawn(process.execPath, [process.argv[1]!, ...(pendingCommand as string[])], {
      stdio: 'inherit',
    });

    if (isSetupCmd) {
      await new Promise<void>((res) => proc.on('exit', () => res()));
      process.stdout.write('\nPress any key to restart UISeal… ');
      readline.emitKeypressEvents(process.stdin);
      if ((process.stdin as NodeJS.ReadStream).isTTY) {
        (process.stdin as NodeJS.ReadStream).setRawMode(true);
      }
      process.stdin.resume();
      await new Promise<void>((res) => {
        process.stdin.once('keypress', () => {
          if ((process.stdin as NodeJS.ReadStream).isTTY) {
            (process.stdin as NodeJS.ReadStream).setRawMode(false);
          }
          process.stdin.pause();
          res();
        });
      });
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
  program.addCommand(driftCommand);
  program.addCommand(watchCommand);

  program.parse();
}
