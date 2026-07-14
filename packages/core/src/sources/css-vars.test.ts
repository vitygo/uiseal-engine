import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cssVarsSource } from './css-vars.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uiseal-css-vars-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('cssVarsSource — detect', () => {
  it('returns found: false when no :root vars exist anywhere', async () => {
    fs.writeFileSync(path.join(tmpDir, 'index.css'), '.a { color: red; }\n');
    const result = await cssVarsSource.detect(tmpDir);
    expect(result.found).toBe(false);
  });

  it('finds variables.css at the project root with 3+ custom properties', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'variables.css'),
      ':root { --color-primary: #02c39a; --spacing-sm: 8px; --spacing-md: 16px; }\n',
    );
    const result = await cssVarsSource.detect(tmpDir);
    expect(result.found).toBe(true);
    expect(result.confidence).toBe(0.8);
    expect(result.file).toBe(path.join(tmpDir, 'variables.css'));
  });

  it('does not count a file with fewer than 3 custom properties', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'variables.css'),
      ':root { --color-primary: #02c39a; }\n',
    );
    const result = await cssVarsSource.detect(tmpDir);
    expect(result.found).toBe(false);
  });

  it('looks inside src/styles/ too', async () => {
    fs.mkdirSync(path.join(tmpDir, 'src', 'styles'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'styles', 'theme.css'),
      ':root { --a: #fff; --b: 4px; --c: 8px; }\n',
    );
    const result = await cssVarsSource.detect(tmpDir);
    expect(result.found).toBe(true);
    expect(result.file).toBe(path.join(tmpDir, 'src', 'styles', 'theme.css'));
  });

  it('prefers the candidate file with the most variables', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'variables.css'),
      ':root { --a: #fff; --b: 4px; --c: 8px; }\n',
    );
    fs.writeFileSync(
      path.join(tmpDir, 'tokens.css'),
      ':root { --a: #fff; --b: 4px; --c: 8px; --d: 16px; --e: 24px; }\n',
    );
    const result = await cssVarsSource.detect(tmpDir);
    expect(result.file).toBe(path.join(tmpDir, 'tokens.css'));
  });
});

describe('cssVarsSource — extract (CSS :root)', () => {
  it('keeps semantic names for colors', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'variables.css'),
      ':root { --color-primary: #02c39a; --color-danger: #d93025; --sp-md: 16px; }\n',
    );
    const tokens = await cssVarsSource.extract(tmpDir);
    expect(tokens.colors).toEqual({ 'color-primary': '#02c39a', 'color-danger': '#d93025' });
  });

  it('classifies spacing/font-size/radius by name heuristic', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'variables.css'),
      [
        ':root {',
        '  --sp-sm: 8px;',
        '  --sp-md: 16px;',
        '  --font-size-base: 16px;',
        '  --text-lg: 20px;',
        '  --radius-sm: 4px;',
        '  --corner-lg: 12px;',
        '}',
      ].join('\n'),
    );
    const tokens = await cssVarsSource.extract(tmpDir);
    expect(tokens.spacing).toEqual([8, 16]);
    expect(tokens.fontSizes).toEqual([16, 20]);
    expect(tokens.radii).toEqual([4, 12]);
  });

  it('resolves a literal CSS-property-named variable via parseValue directly', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'variables.css'),
      ':root { --padding: 8px; --border-radius: 4px; --unused-1: 1px; }\n',
    );
    const tokens = await cssVarsSource.extract(tmpDir);
    expect(tokens.spacing).toEqual([8]);
    expect(tokens.radii).toEqual([4]);
  });

  it('skips ambiguous numeric values with no naming hint', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'variables.css'),
      ':root { --color-a: #fff; --mystery: 12px; --another: 20px; }\n',
    );
    const tokens = await cssVarsSource.extract(tmpDir);
    expect(tokens.spacing).toEqual([]);
    expect(tokens.fontSizes).toEqual([]);
    expect(tokens.radii).toEqual([]);
  });

  it('dedupes and sorts numeric arrays', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'variables.css'),
      ':root { --sp-a: 16px; --sp-b: 8px; --sp-c: 16px; }\n',
    );
    const tokens = await cssVarsSource.extract(tmpDir);
    expect(tokens.spacing).toEqual([8, 16]);
  });
});

describe('cssVarsSource — extract (SCSS $variables)', () => {
  it('extracts top-level $variables the same way as :root custom properties', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '_variables.scss'),
      [
        '$color-primary: #02c39a;',
        '$spacing-md: 12px;',
        '$radius-sm: 4px;',
      ].join('\n'),
    );
    const tokens = await cssVarsSource.extract(tmpDir);
    expect(tokens.colors).toEqual({ 'color-primary': '#02c39a' });
    expect(tokens.spacing).toEqual([12]);
    expect(tokens.radii).toEqual([4]);
  });
});

describe('cssVarsSource — extract throws when nothing detected', () => {
  it('throws a helpful error', async () => {
    await expect(cssVarsSource.extract(tmpDir)).rejects.toThrow(/No CSS\/SCSS variable file found/);
  });
});
