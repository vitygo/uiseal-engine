import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_BIN = resolve(__dirname, '../../dist/index.js');
const PKG_VERSION = (JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8')) as { version: string }).version;
const CLEAN_FIXTURE = resolve(__dirname, '../__fixtures__/clean-fixture');
const VIOLATING_FIXTURE = resolve(__dirname, '../__fixtures__/violating-fixture');

function runCli(args: string[], cwd: string) {
  return spawnSync('node', [CLI_BIN, ...args], { cwd, encoding: 'utf8' });
}

describe('smoke tests', () => {
  it('exits 0 for a project with no violations', () => {
    const result = runCli(['check'], CLEAN_FIXTURE);
    expect(result.status).toBe(0);
  });

  it('exits 1 for a project with error-severity violations', () => {
    const result = runCli(['check'], VIOLATING_FIXTURE);
    expect(result.status).toBe(1);
  });

  it('prints violation details for a violating project', () => {
    const result = runCli(['check'], VIOLATING_FIXTURE);
    expect(result.stdout).toContain('no-hardcoded-color');
  });

  it('--version output matches package.json version', () => {
    const result = runCli(['--version'], process.cwd());
    expect(result.stdout.trim()).toBe(PKG_VERSION);
  });
});
