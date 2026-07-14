import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { codeScanSource } from './code-scan.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uiseal-code-scan-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('codeScanSource', () => {
  it('detect() always reports found with the lowest confidence', async () => {
    const result = await codeScanSource.detect(tmpDir);
    expect(result.found).toBe(true);
    expect(result.confidence).toBe(0.1);
  });

  it('extract() scans repeated values in project source files into SourceTokens shape', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'styles.css'),
      '.a { color: #3b82f6; padding: 8px; } .b { color: #3b82f6; padding: 8px; }\n',
    );

    const tokens = await codeScanSource.extract(tmpDir);

    expect(tokens.colors).toEqual({ '--color-1': '#3b82f6' });
    expect(tokens.spacing).toEqual([8]);
    expect(tokens.fontSizes).toEqual([]);
    expect(tokens.fontFamilies).toEqual([]);
    expect(tokens.radii).toEqual([]);
  });

  it('extract() prefers a CSS variable name over a synthetic --color-N key', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'styles.css'),
      [
        ':root { --brand: #3b82f6; }',
        '.a { color: #3b82f6; }',
        '.b { color: #3b82f6; }',
      ].join('\n'),
    );

    const tokens = await codeScanSource.extract(tmpDir);

    expect(tokens.colors).toEqual({ '--brand': '#3b82f6' });
  });

  it('extract() drops values used fewer than 2 times', async () => {
    fs.writeFileSync(path.join(tmpDir, 'styles.css'), '.a { padding: 13px; }\n');

    const tokens = await codeScanSource.extract(tmpDir);

    expect(tokens.spacing).toEqual([]);
  });
});
