import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_BIN = resolve(__dirname, '../../dist/index.js');
const SVELTE_FIXTURE = resolve(__dirname, '../__fixtures__/svelte-fixture');

function runCli(args: string[], cwd: string) {
  return spawnSync('node', [CLI_BIN, ...args], { cwd, encoding: 'utf8' });
}

describe('Svelte smoke test — buildGlob() picks up .svelte', () => {
  it('discovers and analyzes a .svelte file end-to-end (glob -> parse -> analyze -> report)', () => {
    const result = runCli(['check'], SVELTE_FIXTURE);
    expect(result.stdout).toContain('Card.svelte');
    expect(result.stdout).toContain('no-hardcoded-color');
    expect(result.status).toBe(1);
  });

  it('flags the arbitrary Tailwind class in the .svelte template', () => {
    const result = runCli(['check'], SVELTE_FIXTURE);
    expect(result.stdout).toContain('no-tailwind-arbitrary');
    expect(result.stdout).toContain('mt-[13px]');
  });

  it('never flags the standard Tailwind utility px-4', () => {
    const result = runCli(['check'], SVELTE_FIXTURE);
    expect(result.stdout).not.toContain("'px-4'");
  });
});
