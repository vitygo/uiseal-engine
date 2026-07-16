import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { glob } from 'glob';
import chokidar from 'chokidar';
import micromatch from 'micromatch';
import {
  loadConfig,
  IncrementalAnalyzer,
  allRules,
  formatReport,
  buildGlob,
  getParserForFile,
} from '@uiseal/core';
import { ChangeBatcher } from '../watch/change-batcher.js';

const DEFAULT_DEBOUNCE_MS = 300;
const CLEAR_SCREEN = '\x1b[2J\x1b[H';

export interface WatchOptions {
  configDir?: string;
  scanPath?: string;
  debounceMs?: number;
  clear?: boolean;
}

type WatchEvent = { type: 'change'; path: string; content: string } | { type: 'unlink'; path: string };

function relPath(cwd: string, file: string): string {
  const rel = path.relative(cwd, file);
  return rel.startsWith('..') ? file : rel;
}

function renderHeader(summary: ReturnType<IncrementalAnalyzer['getSummary']>, lastUpdateLabel: string): string {
  const lines: string[] = [];
  lines.push('┌' + '─'.repeat(56) + '┐');
  lines.push('│  uiseal watch'.padEnd(57) + '│');
  lines.push(
    `│  ${summary.total} violation${summary.total === 1 ? '' : 's'} (${summary.errors} errors, ${summary.warnings} warnings) in ${summary.filesWithViolations} file${summary.filesWithViolations === 1 ? '' : 's'}`.padEnd(
      57,
    ) + '│',
  );
  if (lastUpdateLabel) {
    lines.push(`│  Last update: ${lastUpdateLabel}`.padEnd(57) + '│');
  }
  lines.push('└' + '─'.repeat(56) + '┘');
  return lines.join('\n') + '\n\n';
}

export async function runWatch(opts: WatchOptions): Promise<void> {
  const searchFrom = opts.configDir
    ? path.resolve(opts.configDir)
    : opts.scanPath
      ? path.resolve(opts.scanPath)
      : process.cwd();

  const { config, projectRoot } = await loadConfig(searchFrom);
  const watchRoot = opts.scanPath ? path.resolve(opts.scanPath) : projectRoot;
  const debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const clearOnUpdate = opts.clear !== false;

  const analyzer = new IncrementalAnalyzer(config, allRules);
  const knownFiles = new Set<string>();
  let lastUpdateLabel = '';

  const HARD_IGNORE = ['**/node_modules/**', '**/.git/**'];

  function isIgnoredPath(filePath: string): boolean {
    return micromatch.isMatch(filePath, [...HARD_IGNORE, ...config.ignore]);
  }

  function isWatchableFile(filePath: string): boolean {
    return getParserForFile(filePath) !== undefined;
  }

  function render(): void {
    if (clearOnUpdate) process.stdout.write(CLEAR_SCREEN);
    const violations = analyzer.getAll();
    const summary = analyzer.getSummary();
    process.stdout.write(renderHeader(summary, lastUpdateLabel));
    process.stdout.write(formatReport(violations));
    process.stdout.write(`\nWatching ${knownFiles.size} files... press q to quit\n`);
  }

  // Initial full scan — this is the only non-incremental pass, seeding
  // IncrementalAnalyzer with every currently-watchable file before any
  // change events start arriving.
  const initialPaths = await glob(buildGlob(), {
    cwd: watchRoot,
    ignore: ['**/node_modules/**', ...config.ignore],
    absolute: true,
  });
  const initialChanges = initialPaths
    .filter((p) => fs.existsSync(p))
    .map((p) => {
      knownFiles.add(p);
      return { path: p, content: fs.readFileSync(p, 'utf8') };
    });
  analyzer.update(initialChanges);
  render();

  const batcher = new ChangeBatcher<WatchEvent>(debounceMs, (events) => {
    const updates = events.filter((e): e is Extract<WatchEvent, { type: 'change' }> => e.type === 'change');
    const removals = events.filter((e): e is Extract<WatchEvent, { type: 'unlink' }> => e.type === 'unlink');

    if (updates.length > 0) {
      analyzer.update(updates.map((u) => ({ path: u.path, content: u.content })));
    }
    for (const r of removals) {
      analyzer.remove(r.path);
      knownFiles.delete(r.path);
    }

    const label =
      events.length === 1
        ? describeSingleEvent(events[0]!, watchRoot, analyzer)
        : `${events.length} files changed`;
    lastUpdateLabel = label;
    render();
  });

  function describeSingleEvent(event: WatchEvent, cwd: string, an: IncrementalAnalyzer): string {
    const rel = relPath(cwd, event.path);
    if (event.type === 'unlink') return `${rel} (removed)`;
    const count = an.getAll().filter((v) => v.file === event.path).length;
    return `${rel} (${count} violation${count === 1 ? '' : 's'})`;
  }

  const watcher = chokidar.watch(watchRoot, {
    // chokidar calls this before stat info is available for a path it
    // hasn't visited yet (notably the watch root itself) — returning true
    // for a directory just because it fails the FILE extension check would
    // prune the whole tree before chokidar ever descends into it. Ignore
    // patterns are path-only (no stat needed) so they apply immediately;
    // the extension check only applies once we know it's a file.
    ignored: (filePath: string, stats?: fs.Stats) => {
      if (isIgnoredPath(filePath)) return true;
      if (!stats) return false;
      if (stats.isDirectory()) return false;
      return !isWatchableFile(filePath);
    },
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: debounceMs, pollInterval: Math.min(50, debounceMs) },
  });

  watcher.on('add', (filePath) => {
    const abs = path.resolve(filePath);
    knownFiles.add(abs);
    batcher.add(abs, { type: 'change', path: abs, content: fs.readFileSync(abs, 'utf8') });
  });
  watcher.on('change', (filePath) => {
    const abs = path.resolve(filePath);
    batcher.add(abs, { type: 'change', path: abs, content: fs.readFileSync(abs, 'utf8') });
  });
  watcher.on('unlink', (filePath) => {
    const abs = path.resolve(filePath);
    batcher.add(abs, { type: 'unlink', path: abs });
  });
  await new Promise<void>((resolvePromise) => {
    function cleanup(): void {
      batcher.cancel();
      process.stdin.removeListener('keypress', onKeypress);
      process.removeListener('SIGINT', onSigint);
      process.removeListener('SIGTERM', onSigint);
      if ((process.stdin as NodeJS.ReadStream).isTTY) {
        (process.stdin as NodeJS.ReadStream).setRawMode(false);
      }
      process.stdin.pause();
      resolvePromise();
    }
    function onKeypress(str: string, key: { ctrl?: boolean; name?: string } | undefined): void {
      if (str === 'q' || (key?.ctrl && key.name === 'c')) cleanup();
    }
    function onSigint(): void {
      cleanup();
    }

    readline.emitKeypressEvents(process.stdin);
    if ((process.stdin as NodeJS.ReadStream).isTTY) {
      (process.stdin as NodeJS.ReadStream).setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.on('keypress', onKeypress);
    process.on('SIGINT', onSigint);
    process.on('SIGTERM', onSigint);
  });

  await watcher.close();

  const summary = analyzer.getSummary();
  process.stdout.write(
    `\nFinal: ${summary.total} violation${summary.total === 1 ? '' : 's'} (${summary.errors} errors, ${summary.warnings} warnings) in ${summary.filesWithViolations} file${summary.filesWithViolations === 1 ? '' : 's'}\n`,
  );
  process.exitCode = summary.errors > 0 ? 1 : 0;
}

export const watchCommand = new Command('watch')
  .description('Watch files and re-scan incrementally as they change')
  .argument('[path]', 'Directory to watch (defaults to cwd)')
  .option('-c, --config <dir>', 'Directory containing uiseal.config.{ts,js,json}')
  .option('--debounce <ms>', `Debounce delay in milliseconds (default ${DEFAULT_DEBOUNCE_MS})`, String(DEFAULT_DEBOUNCE_MS))
  .option('--clear', 'Clear terminal on each update (default)', true)
  .option('--no-clear', 'Do not clear the terminal on each update')
  .action(async (scanPath: string | undefined, opts: { config?: string; debounce: string; clear: boolean }) => {
    const debounceMs = Number(opts.debounce);
    if (!Number.isFinite(debounceMs) || debounceMs < 0) {
      process.stderr.write(`Error: invalid --debounce "${opts.debounce}" (expected a non-negative number)\n`);
      process.exitCode = 2;
      return;
    }
    try {
      await runWatch({ configDir: opts.config, scanPath, debounceMs, clear: opts.clear !== false });
    } catch (err) {
      process.stderr.write(`Error: ${(err as Error).message}\n`);
      process.exitCode = 2;
    }
  });
