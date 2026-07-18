import { describe, it, expect, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_BIN = resolve(__dirname, '../../dist/index.js');
const DEBOUNCE_MS = 50;

// uiseal watch is a long-running process (unlike every other CLI command
// tested via spawnSync elsewhere in this package), so it needs a real
// child process plus polling for expected output rather than a single
// blocking spawnSync call.
async function waitUntil(check: () => boolean, timeoutMs = 8000, intervalMs = 50): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`waitUntil: condition not met within ${timeoutMs}ms`);
}

function lastHeader(output: string): string {
  const idx = output.lastIndexOf('┌');
  return idx === -1 ? '' : output.slice(idx);
}

let proc: ChildProcess | null = null;
let tmpDir: string | null = null;

afterEach(() => {
  if (proc && proc.exitCode === null && !proc.killed) {
    proc.kill('SIGKILL');
  }
  proc = null;
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

describe('uiseal watch', () => {
  it('re-scans incrementally as files change, ignores config.ignore paths, and exits cleanly on q', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uiseal-watch-'));
    fs.mkdirSync(path.join(tmpDir, 'src'));
    fs.mkdirSync(path.join(tmpDir, 'vendor'));

    fs.writeFileSync(
      path.join(tmpDir, 'uiseal.config.json'),
      JSON.stringify({
        tokens: {
          colors: { primary: '#3b82f6' },
          spacing: [4, 8, 16, 24, 32],
          fontSizes: [12, 14, 16],
          fontFamilies: ['Inter'],
          radii: [4, 8],
        },
        rules: {},
        ignore: ['**/vendor/**'],
      }),
    );
    fs.writeFileSync(path.join(tmpDir, 'src', 'App.tsx'), 'export const App = () => <div>hello</div>;\n');
    // A violation sitting in an ignored directory from the very start —
    // it must never show up, in the initial scan or after.
    fs.writeFileSync(
      path.join(tmpDir, 'vendor', 'Bad.tsx'),
      "export const Bad = () => <div style={{ color: '#ff0000' }}>x</div>;\n",
    );

    let output = '';
    proc = spawn('node', [CLI_BIN, 'watch', '--debounce', String(DEBOUNCE_MS), '--no-clear'], { cwd: tmpDir });
    proc.stdout!.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    proc.stderr!.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });

    // Initial scan: clean, and the ignored directory never appears.
    await waitUntil(() => output.includes('Watching'));
    expect(lastHeader(output)).toContain('0 violations');
    expect(output).not.toContain('vendor/Bad.tsx');

    // Add a violation to the watched (non-ignored) file.
    const afterInitialLength = output.length;
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'App.tsx'),
      "export const App = () => <div style={{ color: '#ff0000', padding: '13px' }}>hello</div>;\n",
    );
    await waitUntil(() => output.slice(afterInitialLength).includes('Last update:'));
    const afterAdd = lastHeader(output);
    expect(afterAdd).toMatch(/[1-9]\d* violations? \(/);
    expect(afterAdd).toContain('Last update: src/App.tsx');

    // Editing a file inside the ignored directory must NOT trigger an update.
    const beforeIgnoredEditLength = output.length;
    fs.writeFileSync(
      path.join(tmpDir, 'vendor', 'Bad.tsx'),
      "export const Bad = () => <div style={{ color: '#00ff00' }}>changed</div>;\n",
    );
    await new Promise((r) => setTimeout(r, DEBOUNCE_MS * 4)); // give it a chance to (wrongly) fire
    expect(output.slice(beforeIgnoredEditLength)).not.toContain('Last update:');

    // Fix the violation — count should drop back to 0.
    const afterIgnoredEditLength = output.length;
    fs.writeFileSync(path.join(tmpDir, 'src', 'App.tsx'), 'export const App = () => <div>hello</div>;\n');
    await waitUntil(() => output.slice(afterIgnoredEditLength).includes('Last update:'));
    const afterFix = lastHeader(output);
    expect(afterFix).toContain('0 violations');

    // Clean quit via 'q'.
    proc.stdin!.write('q');
    const exitCode = await new Promise<number | null>((resolvePromise) => {
      proc!.on('exit', (code) => resolvePromise(code));
    });
    expect(exitCode).toBe(0);
    expect(output).toContain('Final: 0 violations');
  }, 15000);

  it('picks up changes to a .blade.php file (buildGlob() includes backend template extensions)', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uiseal-watch-template-'));
    fs.writeFileSync(
      path.join(tmpDir, 'uiseal.config.json'),
      JSON.stringify({
        tokens: {
          colors: { primary: '#3b82f6' },
          spacing: [4, 8, 16, 24],
          fontSizes: [12, 14, 16],
          fontFamilies: ['Inter'],
          radii: [4, 8],
        },
        rules: {},
        ignore: [],
      }),
    );
    fs.writeFileSync(path.join(tmpDir, 'view.blade.php'), '<div class="px-4">hello</div>\n');

    let output = '';
    proc = spawn('node', [CLI_BIN, 'watch', '--debounce', String(DEBOUNCE_MS), '--no-clear'], { cwd: tmpDir });
    proc.stdout!.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    proc.stderr!.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });

    await waitUntil(() => output.includes('Watching'));
    expect(output).toContain('Watching 1 files');
    expect(lastHeader(output)).toContain('0 violations');

    const beforeEditLength = output.length;
    fs.writeFileSync(path.join(tmpDir, 'view.blade.php'), '<div class="px-4 mt-[13px]">{{ $name }}</div>\n');
    await waitUntil(() => output.slice(beforeEditLength).includes('Last update:'));
    const afterEdit = lastHeader(output);
    expect(afterEdit).not.toContain('0 violations');
    expect(afterEdit).toContain('Last update: view.blade.php');
    expect(output).toContain('mt-[13px]');
    expect(output).not.toContain('$name');

    proc.stdin!.write('q');
    const exitCode = await new Promise<number | null>((resolvePromise) => {
      proc!.on('exit', (code) => resolvePromise(code));
    });
    expect(exitCode).toBe(0);
  }, 15000);
});
