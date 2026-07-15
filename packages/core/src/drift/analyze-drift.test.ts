import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyzeDrift } from './analyze-drift.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uiseal-drift-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('analyzeDrift — CSS vars source', () => {
  it('computes drifted values, unused tokens, and drift percentage correctly', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'variables.css'),
      ':root { --color-primary: #3b82f6; --color-danger: #ef4444; --sp-sm: 8px; --sp-md: 16px; }\n',
    );
    fs.mkdirSync(path.join(tmpDir, 'src'));
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'Button.tsx'),
      [
        'export const Button = () => (',
        "  <button style={{ color: '#3b82f6', padding: '16px' }}>OK</button>", // on-token: color + spacing
        ');',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'Alert.tsx'),
      [
        'export const Alert = () => (',
        "  <div style={{ color: '#1a73e8', padding: '13px' }}>Alert</div>", // off-token: color + spacing
        ');',
      ].join('\n'),
    );

    const report = await analyzeDrift({ cwd: tmpDir, sourceId: 'css-vars' });

    expect(report.source.id).toBe('css-vars');

    // Source has 2 colors, code uses 2 unique colors (#3b82f6 on-token,
    // #1a73e8 off-token) -> 1 drifted, --color-danger unused.
    expect(report.categories.colors.tokensInSource).toBe(2);
    expect(report.categories.colors.uniqueValuesInCode).toBe(2);
    expect(report.categories.colors.driftedValues).toHaveLength(1);
    expect(report.categories.colors.driftedValues[0]!.value).toBe('#1a73e8');
    expect(report.categories.colors.driftedValues[0]!.occurrences).toBe(1);
    expect(report.categories.colors.driftedValues[0]!.files[0]!.file).toContain('Alert.tsx');
    expect(report.categories.colors.unusedTokens).toEqual(['color-danger']);

    // Source has 2 spacing tokens, code uses 2 unique spacing values (16px
    // on-token, 13px off-token, near 16px within threshold 4 -> nearestToken set).
    expect(report.categories.spacing.tokensInSource).toBe(2);
    expect(report.categories.spacing.uniqueValuesInCode).toBe(2);
    expect(report.categories.spacing.driftedValues).toHaveLength(1);
    expect(report.categories.spacing.driftedValues[0]!.value).toBe('13px');
    expect(report.categories.spacing.driftedValues[0]!.nearestToken).toBe('16px');
    expect(report.categories.spacing.unusedTokens).toEqual([8]);

    // Overall: 4 unique values in code total (2 colors + 2 spacing), 2 drifted.
    expect(report.summary.totalUniqueValuesInCode).toBe(4);
    expect(report.summary.totalDriftedValues).toBe(2);
    expect(report.summary.driftPercentage).toBe(50);
  });

  it('returns 0% drift and no drifted values when everything matches the source', async () => {
    fs.writeFileSync(path.join(tmpDir, 'variables.css'), ':root { --color-primary: #3b82f6; --sp-a: 8px; --sp-b: 16px; }\n');
    fs.writeFileSync(
      path.join(tmpDir, 'app.tsx'),
      "export const A = () => <div style={{ color: '#3b82f6', padding: '8px' }} />;",
    );

    const report = await analyzeDrift({ cwd: tmpDir, sourceId: 'css-vars' });

    expect(report.summary.totalDriftedValues).toBe(0);
    expect(report.summary.driftPercentage).toBe(0);
  });

  it('returns 100% drift when nothing in code matches the source', async () => {
    fs.writeFileSync(path.join(tmpDir, 'variables.css'), ':root { --color-primary: #3b82f6; --sp-a: 8px; --sp-b: 16px; }\n');
    fs.writeFileSync(
      path.join(tmpDir, 'app.tsx'),
      "export const A = () => <div style={{ color: '#111111', padding: '99px' }} />;",
    );

    const report = await analyzeDrift({ cwd: tmpDir, sourceId: 'css-vars' });

    expect(report.summary.driftPercentage).toBe(100);
    expect(report.summary.totalDriftedValues).toBe(report.summary.totalUniqueValuesInCode);
  });

  it('handles a codebase with no style values without dividing by zero', async () => {
    fs.writeFileSync(path.join(tmpDir, 'variables.css'), ':root { --color-primary: #3b82f6; --sp-a: 8px; --sp-b: 16px; }\n');
    fs.writeFileSync(path.join(tmpDir, 'app.tsx'), 'export const A = () => <div>Hello</div>;');

    const report = await analyzeDrift({ cwd: tmpDir, sourceId: 'css-vars' });

    expect(report.summary.totalUniqueValuesInCode).toBe(0);
    expect(report.summary.driftPercentage).toBe(0);
    expect(Number.isNaN(report.summary.driftPercentage)).toBe(false);
  });

  it('handles a source detected but with no tokens at all (empty theme)', async () => {
    // A variables.css with fewer than the css-vars source's own MIN_VARS
    // threshold wouldn't be "detected" at all; write one that qualifies but
    // whose values don't fall into any of the checked categories, so every
    // category's tokensInSource ends up 0.
    fs.writeFileSync(
      tmpDir + '/variables.css',
      ':root { --mystery-a: 12px; --mystery-b: 20px; --mystery-c: 5px; }\n',
    );
    fs.writeFileSync(
      path.join(tmpDir, 'app.tsx'),
      "export const A = () => <div style={{ color: '#1a73e8', padding: '13px' }} />;",
    );

    const report = await analyzeDrift({ cwd: tmpDir, sourceId: 'css-vars' });

    expect(report.summary.totalTokensInSource).toBe(0);
    // Nothing in source to match against -> both code values count as drifted.
    expect(report.summary.totalDriftedValues).toBe(report.summary.totalUniqueValuesInCode);
    expect(Number.isNaN(report.summary.driftPercentage)).toBe(false);
  });
});

describe('analyzeDrift — Tailwind source', () => {
  it('computes drift against a live tailwind.config.js (re-read at drift time, not from a cached config)', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'tailwind.config.js'),
      `module.exports = {
        theme: {
          colors: { primary: '#3b82f6' },
          spacing: { 4: '1rem', 8: '2rem' },
        },
      };`,
    );
    fs.mkdirSync(path.join(tmpDir, 'src'));
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'Button.tsx'),
      "export const Button = () => <button style={{ color: '#3b82f6', padding: '16px' }} />;", // on-token
    );
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'Alert.tsx'),
      "export const Alert = () => <div style={{ color: '#1a73e8', padding: '13px' }} />;", // off-token
    );

    const report = await analyzeDrift({ cwd: tmpDir, sourceId: 'tailwind' });

    expect(report.source.id).toBe('tailwind');
    expect(report.categories.colors.tokensInSource).toBe(1);
    expect(report.categories.colors.driftedValues.map((v) => v.value)).toEqual(['#1a73e8']);
    expect(report.categories.spacing.tokensInSource).toBe(2);
    expect(report.categories.spacing.driftedValues[0]!.nearestToken).toBe('16px');
  });
});

describe('analyzeDrift — error handling', () => {
  it('throws a helpful error when no source is detected', async () => {
    // An empty dir with no tailwind/css-vars file still has code-scan as a
    // fallback (always "found"), so requesting a SPECIFIC absent source is
    // what actually triggers the not-found path.
    await expect(analyzeDrift({ cwd: tmpDir, sourceId: 'tailwind' })).rejects.toThrow(/No Tailwind CSS config found/);
  });

  it('throws a helpful error for an unknown source id', async () => {
    await expect(analyzeDrift({ cwd: tmpDir, sourceId: 'bogus' })).rejects.toThrow(/Unknown token source "bogus"/);
  });
});
