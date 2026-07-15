import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_BIN = resolve(__dirname, '../../dist/index.js');
const VUE_FIXTURE = resolve(__dirname, '../__fixtures__/vue-fixture');

function runCli(args: string[], cwd: string) {
  return spawnSync('node', [CLI_BIN, ...args], { cwd, encoding: 'utf8' });
}

describe('Vue SFC smoke test — buildGlob() picks up .vue', () => {
  it('discovers and analyzes a .vue file end-to-end (glob -> parse -> analyze -> report)', () => {
    const result = runCli(['check'], VUE_FIXTURE);
    expect(result.stdout).toContain('Scanned 1 file');
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('no-hardcoded-color');
    expect(result.stdout).toContain('Card.vue');
  });

  it('flags the arbitrary Tailwind class in the .vue template', () => {
    const result = runCli(['check'], VUE_FIXTURE);
    expect(result.stdout).toContain('no-tailwind-arbitrary');
    expect(result.stdout).toContain('mt-[13px]');
  });

  it('never flags standard Tailwind utilities in the .vue template', () => {
    const result = runCli(['check'], VUE_FIXTURE);
    expect(result.stdout).not.toContain("'px-4'");
    expect(result.stdout).not.toContain("'text-blue-500'");
  });
});
