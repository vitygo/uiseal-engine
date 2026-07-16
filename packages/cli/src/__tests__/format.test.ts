import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_BIN = resolve(__dirname, '../../dist/index.js');
const VIOLATING_FIXTURE = resolve(__dirname, '../__fixtures__/violating-fixture');

// ANSI escape codes (colors, styling) — none of these should ever appear in
// json/sarif stdout, since that stream must stay valid, parseable output.
const ANSI_RE = /\x1b\[[0-9;]*m/;

function runCli(args: string[], cwd: string) {
  return spawnSync('node', [CLI_BIN, ...args], { cwd, encoding: 'utf8' });
}

const tmpDirs: string[] = [];
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function mkTmpDir(): string {
  const dir = fs.mkdtempSync(join(os.tmpdir(), 'uiseal-format-'));
  tmpDirs.push(dir);
  return dir;
}

describe('uiseal check --format', () => {
  it('rejects an unknown --format value', () => {
    const result = runCli(['check', '--format', 'yaml'], VIOLATING_FIXTURE);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('invalid --format');
  });

  it('--format pretty (default) is unchanged: ANSI-colored, unparseable as JSON', () => {
    const result = runCli(['check'], VIOLATING_FIXTURE);
    const explicit = runCli(['check', '--format', 'pretty'], VIOLATING_FIXTURE);
    expect(explicit.stdout).toBe(result.stdout);
    expect(explicit.status).toBe(result.status);
    expect(ANSI_RE.test(result.stdout)).toBe(true);
  });

  describe('--format json', () => {
    it('produces clean, parseable JSON on stdout with no ANSI codes', () => {
      const result = runCli(['check', '--format', 'json'], VIOLATING_FIXTURE);
      expect(ANSI_RE.test(result.stdout)).toBe(false);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('has the { violations, summary } shape with correct counts', () => {
      const result = runCli(['check', '--format', 'json'], VIOLATING_FIXTURE);
      const parsed = JSON.parse(result.stdout);
      expect(Array.isArray(parsed.violations)).toBe(true);
      expect(parsed.violations.length).toBeGreaterThan(0);
      expect(parsed.summary.total).toBe(parsed.violations.length);
      expect(parsed.summary.errors).toBe(
        parsed.violations.filter((v: { severity: string }) => v.severity === 'error').length,
      );
      expect(parsed.summary.filesScanned).toBeGreaterThan(0);
    });

    it('keeps the exit code the same as pretty format', () => {
      const pretty = runCli(['check'], VIOLATING_FIXTURE);
      const json = runCli(['check', '--format', 'json'], VIOLATING_FIXTURE);
      expect(json.status).toBe(pretty.status);
    });
  });

  describe('--format sarif', () => {
    it('produces clean, parseable SARIF JSON on stdout with no ANSI codes', () => {
      const result = runCli(['check', '--format', 'sarif'], VIOLATING_FIXTURE);
      expect(ANSI_RE.test(result.stdout)).toBe(false);
      const doc = JSON.parse(result.stdout);
      expect(doc.version).toBe('2.1.0');
      expect(doc.runs[0].results.length).toBeGreaterThan(0);
    });

    it('every result ruleId resolves against tool.driver.rules', () => {
      const result = runCli(['check', '--format', 'sarif'], VIOLATING_FIXTURE);
      const doc = JSON.parse(result.stdout);
      const ids = new Set(doc.runs[0].tool.driver.rules.map((r: { id: string }) => r.id));
      for (const res of doc.runs[0].results) {
        expect(ids.has(res.ruleId)).toBe(true);
      }
    });

    it('uses repo-root-relative, forward-slashed URIs', () => {
      const result = runCli(['check', '--format', 'sarif'], VIOLATING_FIXTURE);
      const doc = JSON.parse(result.stdout);
      for (const res of doc.runs[0].results) {
        const uri = res.locations[0].physicalLocation.artifactLocation.uri;
        expect(uri.startsWith('/')).toBe(false);
        expect(uri.startsWith('./')).toBe(false);
        expect(uri).not.toContain('\\');
      }
    });
  });

  describe('--output', () => {
    it('writes SARIF to the given file and leaves stdout clean', () => {
      const dir = mkTmpDir();
      const outFile = join(dir, 'results.sarif');
      const result = runCli(['check', '--format', 'sarif', '--output', outFile], VIOLATING_FIXTURE);
      expect(result.stdout).toBe('');
      expect(fs.existsSync(outFile)).toBe(true);
      const doc = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      expect(doc.version).toBe('2.1.0');
      expect(doc.runs[0].results.length).toBeGreaterThan(0);
    });

    it('writes JSON to the given file and leaves stdout clean', () => {
      const dir = mkTmpDir();
      const outFile = join(dir, 'results.json');
      const result = runCli(['check', '--format', 'json', '--output', outFile], VIOLATING_FIXTURE);
      expect(result.stdout).toBe('');
      expect(fs.existsSync(outFile)).toBe(true);
      const parsed = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      expect(parsed.summary.total).toBeGreaterThan(0);
    });

    it('preserves the exit code when writing to a file', () => {
      const dir = mkTmpDir();
      const outFile = join(dir, 'results.sarif');
      const result = runCli(['check', '--format', 'sarif', '--output', outFile], VIOLATING_FIXTURE);
      expect(result.status).toBe(1);
    });
  });
});
