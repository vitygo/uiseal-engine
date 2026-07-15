import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_BIN = resolve(__dirname, '../../dist/index.js');
const ANGULAR_FIXTURE = resolve(__dirname, '../__fixtures__/angular-fixture');

function runCli(args: string[], cwd: string) {
  return spawnSync('node', [CLI_BIN, ...args], { cwd, encoding: 'utf8' });
}

describe('Angular smoke test — buildGlob() picks up .component.ts and .component.html', () => {
  it('discovers and analyzes .component.ts inline styles/template end-to-end', () => {
    const result = runCli(['check'], ANGULAR_FIXTURE);
    expect(result.stdout).toContain('button.component.ts');
    expect(result.stdout).toContain('no-hardcoded-color');
    expect(result.stdout).toContain('no-tailwind-arbitrary');
    expect(result.stdout).toContain('mt-[13px]');
    expect(result.status).toBe(1);
  });

  it('discovers and analyzes an external .component.html template', () => {
    const result = runCli(['check'], ANGULAR_FIXTURE);
    expect(result.stdout).toContain('card.component.html');
    expect(result.stdout).toContain('mt-[7px]');
  });

  it('never scans a plain .ts file (utils.ts never appears in the report)', () => {
    const result = runCli(['check'], ANGULAR_FIXTURE);
    expect(result.stdout).not.toContain('utils.ts');
  });
});
