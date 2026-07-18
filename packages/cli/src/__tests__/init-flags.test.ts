import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_BIN = resolve(__dirname, '../../dist/index.js');

// @clack/prompts drives its interactive flow with raw-mode keypress events,
// which requires a real TTY — piping scripted answers into a plain
// (non-TTY) child process stdin does not resolve any prompt; the process
// just hangs. That makes the full interactive "review tokens, write config"
// flow untestable via spawnSync here (confirmed by manual probing — no pty
// tooling exists in this repo). What IS deterministic and CLI-testable
// without a TTY is everything that happens BEFORE the first prompt: flag
// parsing, source resolution, and the error paths when a requested source
// isn't present. Full extract()-to-SourceTokens correctness is covered at
// the core level (tailwind.test.ts, css-vars.test.ts,
// token-sources-integration.test.ts).

function runInit(args: string[], cwd: string) {
  return spawnSync('node', [CLI_BIN, 'init', ...args], { cwd, encoding: 'utf8' });
}

let tmpDir: string;

function freshTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'uiseal-init-flags-'));
}

describe('uiseal init --from', () => {
  it('errors on an unrecognized source id, before any prompt', () => {
    tmpDir = freshTmpDir();
    const result = runInit(['--from', 'bogus'], tmpDir);
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain('Unknown token source "bogus"');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('errors when --from tailwind is requested but no tailwind.config exists', () => {
    tmpDir = freshTmpDir();
    const result = runInit(['--from', 'tailwind'], tmpDir);
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain('No Tailwind CSS config found');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('errors when --from css-vars is requested but no variable file exists', () => {
    tmpDir = freshTmpDir();
    const result = runInit(['--from', 'css-vars'], tmpDir);
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain('No CSS variables found');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('errors when --from tokens is requested but no design token file exists', () => {
    tmpDir = freshTmpDir();
    const result = runInit(['--from', 'tokens'], tmpDir);
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain('No Design tokens');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('still refuses to overwrite an existing config without --force, regardless of --from', () => {
    tmpDir = freshTmpDir();
    fs.writeFileSync(path.join(tmpDir, 'uiseal.config.json'), '{}');
    const result = runInit(['--from', 'tailwind'], tmpDir);
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain('Config already exists');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
