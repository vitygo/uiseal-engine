import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyFixes } from './apply-fixes.js';
import { analyze } from '../runner.js';
import { allRules } from '../rules/index.js';
import type { Violation } from '../types.js';
import type { uisealConfig } from '../config/schema.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uiseal-apply-fixes-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFixture(name: string, content: string): string {
  const file = path.join(tmpDir, name);
  fs.writeFileSync(file, content);
  return file;
}

function baseViolation(overrides: Partial<Violation>): Violation {
  return {
    ruleId: 'test-rule',
    severity: 'warning',
    message: 'test',
    file: '',
    line: 1,
    column: 1,
    ...overrides,
  };
}

describe('applyFixes — unit', () => {
  it('applies a single violation with fix + oldValue', () => {
    const file = writeFixture('a.css', '.a { padding: 18px; }\n');
    const violations = [
      baseViolation({
        file,
        line: 1,
        column: 6,
        oldValue: '18px',
        fix: { suggested: '16px' },
      }),
    ];

    const results = applyFixes(violations, { dryRun: false });

    expect(results).toHaveLength(1);
    expect(results[0]!.applied).toEqual([
      { ruleId: 'test-rule', line: 1, column: 6, oldValue: '18px', newValue: '16px' },
    ]);
    expect(results[0]!.skipped).toHaveLength(0);
    expect(fs.readFileSync(file, 'utf8')).toBe('.a { padding: 16px; }\n');
  });

  it('applies multiple violations across multiple lines in one file', () => {
    const file = writeFixture(
      'multi.css',
      '.a { padding: 18px; }\n.b { font-size: 15px; }\n',
    );
    const violations = [
      baseViolation({ file, line: 1, column: 6, oldValue: '18px', fix: { suggested: '16px' } }),
      baseViolation({ file, line: 2, column: 6, oldValue: '15px', fix: { suggested: '14px' } }),
    ];

    const results = applyFixes(violations, { dryRun: false });

    expect(results[0]!.applied).toHaveLength(2);
    expect(fs.readFileSync(file, 'utf8')).toBe('.a { padding: 16px; }\n.b { font-size: 14px; }\n');
  });

  it('applies both violations on the same line, sharing the same reported column (right-to-left resolution)', () => {
    // Mirrors real postcss/JSX behavior: both parts of a multi-value shorthand
    // report the same (line, column) — the declaration's start, not the
    // value's offset — so applyFixes must locate each by scanning the line
    // rather than trusting column as an exact position.
    const file = writeFixture('shorthand.css', '.a { padding: 18px 100px; }\n');
    const violations = [
      baseViolation({ file, line: 1, column: 6, oldValue: '18px', fix: { suggested: '16px' } }),
      baseViolation({ file, line: 1, column: 6, oldValue: '100px', fix: { suggested: '96px' } }),
    ];

    const results = applyFixes(violations, { dryRun: false });

    expect(results[0]!.applied).toHaveLength(2);
    expect(results[0]!.skipped).toHaveLength(0);
    expect(fs.readFileSync(file, 'utf8')).toBe('.a { padding: 16px 96px; }\n');
  });

  it('skips a violation with fix.suggested but no oldValue', () => {
    const file = writeFixture('nofix1.css', '.a { padding: 18px; }\n');
    const violations = [
      baseViolation({ file, line: 1, column: 6, fix: { suggested: '16px' } }),
    ];

    const results = applyFixes(violations, { dryRun: false });

    expect(results[0]!.applied).toHaveLength(0);
    expect(results[0]!.skipped).toEqual([
      { ruleId: 'test-rule', line: 1, column: 6, reason: 'no-fix' },
    ]);
    expect(fs.readFileSync(file, 'utf8')).toBe('.a { padding: 18px; }\n');
  });

  it('skips a violation without fix.suggested', () => {
    const file = writeFixture('nofix2.css', '.a { padding: 100px; }\n');
    const violations = [baseViolation({ file, line: 1, column: 6, oldValue: '100px' })];

    const results = applyFixes(violations, { dryRun: false });

    expect(results[0]!.applied).toHaveLength(0);
    expect(results[0]!.skipped[0]!.reason).toBe('no-fix');
  });

  it('skips with value-mismatch when oldValue is not found on the reported line', () => {
    const file = writeFixture('mismatch.css', '.a { padding: 10px; }\n');
    const violations = [
      baseViolation({ file, line: 1, column: 6, oldValue: '18px', fix: { suggested: '16px' } }),
    ];

    const results = applyFixes(violations, { dryRun: false });

    expect(results[0]!.applied).toHaveLength(0);
    expect(results[0]!.skipped).toEqual([
      { ruleId: 'test-rule', line: 1, column: 6, reason: 'value-mismatch' },
    ]);
    expect(fs.readFileSync(file, 'utf8')).toBe('.a { padding: 10px; }\n');
  });

  it('skips the second violation with value-mismatch when both target the same overlapping text', () => {
    const file = writeFixture('overlap.css', '.a { padding: 18px; }\n');
    const violations = [
      baseViolation({ file, line: 1, column: 6, oldValue: '18px', fix: { suggested: '16px' } }),
      baseViolation({ file, line: 1, column: 6, oldValue: '18px', fix: { suggested: '20px' } }),
    ];

    const results = applyFixes(violations, { dryRun: false });

    expect(results[0]!.applied).toHaveLength(1);
    expect(results[0]!.skipped).toHaveLength(1);
    expect(results[0]!.skipped[0]!.reason).toBe('value-mismatch');
    // Only the first (leftmost-consumed) match was applied.
    expect(fs.readFileSync(file, 'utf8')).toBe('.a { padding: 16px; }\n');
  });

  it('dryRun: true reports FixApplied but does not write the file', () => {
    const file = writeFixture('dry.css', '.a { padding: 18px; }\n');
    const violations = [
      baseViolation({ file, line: 1, column: 6, oldValue: '18px', fix: { suggested: '16px' } }),
    ];

    const results = applyFixes(violations, { dryRun: true });

    expect(results[0]!.applied).toEqual([
      { ruleId: 'test-rule', line: 1, column: 6, oldValue: '18px', newValue: '16px' },
    ]);
    expect(fs.readFileSync(file, 'utf8')).toBe('.a { padding: 18px; }\n');
  });

  it('dryRun: false writes the modified content back to disk', () => {
    const file = writeFixture('wet.css', '.a { padding: 18px; }\n');
    const violations = [
      baseViolation({ file, line: 1, column: 6, oldValue: '18px', fix: { suggested: '16px' } }),
    ];

    applyFixes(violations, { dryRun: false });

    expect(fs.readFileSync(file, 'utf8')).toBe('.a { padding: 16px; }\n');
  });

  it('skips all violations with file-read-error when the file does not exist', () => {
    const missing = path.join(tmpDir, 'does-not-exist.css');
    const violations = [
      baseViolation({ file: missing, line: 1, column: 6, oldValue: '18px', fix: { suggested: '16px' } }),
    ];

    const results = applyFixes(violations, { dryRun: false });

    expect(results).toHaveLength(1);
    expect(results[0]!.applied).toHaveLength(0);
    expect(results[0]!.skipped).toEqual([
      { ruleId: 'test-rule', line: 1, column: 6, reason: 'file-read-error' },
    ]);
  });

  it('returns an empty array for an empty violations list', () => {
    expect(applyFixes([], { dryRun: false })).toEqual([]);
  });
});

describe('applyFixes — full pipeline integration', () => {
  it('fixes color, spacing, font-size, and radius in place; leaves far-miss values untouched', async () => {
    const config: uisealConfig = {
      tokens: {
        colors: { '--primary': '#1a73e8' },
        spacing: [4, 8, 16, 20, 32],
        fontSizes: [14, 16, 18],
        fontFamilies: ['Inter'],
        radii: [4, 8],
      },
      rules: {},
      ignore: [],
    };

    const file = writeFixture(
      'integration.css',
      [
        '.a {',
        '  color: #1b74e9;',
        '  padding: 18px;',
        '  font-size: 15px;',
        '  border-radius: 6px;',
        '  margin: 999px;',
        '}',
        '',
      ].join('\n'),
    );

    const { violations } = await analyze({
      files: new Map([[file, fs.readFileSync(file, 'utf8')]]),
      config,
      rules: allRules,
    });

    applyFixes(violations, { dryRun: false });

    const fixed = fs.readFileSync(file, 'utf8');
    expect(fixed).toContain('color: var(--primary);');
    expect(fixed).toContain('padding: 16px;');
    expect(fixed).toContain('font-size: 14px;');
    expect(fixed).toContain('border-radius: 4px;');
    // 999px has no close token on this scale — untouched.
    expect(fixed).toContain('margin: 999px;');
  });
});
