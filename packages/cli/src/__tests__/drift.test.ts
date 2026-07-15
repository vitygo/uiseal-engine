import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_BIN = resolve(__dirname, '../../dist/index.js');
const DRIFT_FIXTURE = resolve(__dirname, '../__fixtures__/drift-fixture');

function runCli(args: string[], cwd: string) {
  return spawnSync('node', [CLI_BIN, ...args], { cwd, encoding: 'utf8' });
}

describe('uiseal drift', () => {
  it('prints a formatted report with the headline drift percentage', () => {
    const result = runCli(['drift', '--source', 'css-vars'], DRIFT_FIXTURE);
    expect(result.stdout).toContain('DESIGN SYSTEM DRIFT REPORT');
    expect(result.stdout).toContain('DRIFT:');
    expect(result.stdout).toContain('50.0%'); // 2 off-token / 4 unique values in this fixture
  });

  it('exits 1 when drift is at or above the 10% threshold', () => {
    // 1 off-token color + 1 off-token spacing out of 4 unique values = 50%.
    const result = runCli(['drift', '--source', 'css-vars'], DRIFT_FIXTURE);
    expect(result.status).toBe(1);
  });

  it('--json outputs valid, parseable JSON with the expected shape', () => {
    const result = runCli(['drift', '--source', 'css-vars', '--json'], DRIFT_FIXTURE);
    const report = JSON.parse(result.stdout);
    expect(report.source.id).toBe('css-vars');
    expect(typeof report.summary.driftPercentage).toBe('number');
    expect(report.categories.colors).toBeDefined();
  });

  it('errors with a helpful message for an unknown source', () => {
    const result = runCli(['drift', '--source', 'bogus'], DRIFT_FIXTURE);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Unknown token source "bogus"');
  });
});
