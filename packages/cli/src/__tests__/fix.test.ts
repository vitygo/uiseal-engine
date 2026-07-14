import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_BIN = resolve(__dirname, '../../dist/index.js');
const FIXABLE_FIXTURE = resolve(__dirname, '../__fixtures__/fixable-fixture');

function runCli(args: string[], cwd: string) {
  return spawnSync('node', [CLI_BIN, ...args], { cwd, encoding: 'utf8' });
}

describe('--fix / --dry-run', () => {
  // Only --dry-run is exercised here so this fixture's files stay stable for
  // any other test that scans fixable-fixture — real --fix (which writes) is
  // covered by packages/core's applyFixes integration test against temp files.
  it('shows a DRY RUN preview without modifying the fixture', () => {
    const before = readFileSync(resolve(FIXABLE_FIXTURE, 'styles.scss'), 'utf8');

    const result = runCli(['check', '--dry-run'], FIXABLE_FIXTURE);

    expect(result.stdout).toContain('DRY RUN');
    expect(result.stdout).toContain('→');

    const after = readFileSync(resolve(FIXABLE_FIXTURE, 'styles.scss'), 'utf8');
    expect(after).toBe(before);
  });

  it('exits 0 when every violation found is auto-fixable', () => {
    const result = runCli(['check', '--dry-run'], FIXABLE_FIXTURE);
    expect(result.status).toBe(0);
  });
});
