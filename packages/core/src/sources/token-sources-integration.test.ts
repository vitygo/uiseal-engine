import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectSources, getSourceById } from './registry.js';

const FIXTURE_DIR = path.resolve(import.meta.dirname, '../__fixtures__/token-sources-fixture');

describe('detectSources — full fixture (tailwind + css-vars + code)', () => {
  it('detects all three sources with Tailwind ranked highest', async () => {
    const detected = await detectSources(FIXTURE_DIR);
    expect(detected.map((d) => d.source.id)).toEqual(['tailwind', 'css-vars', 'code-scan']);
    expect(detected[0]!.result.confidence).toBe(0.9);
    expect(detected[1]!.result.confidence).toBe(0.8);
    expect(detected[2]!.result.confidence).toBe(0.1);
  });

  it('reports the correct detected file path for Tailwind and css-vars', async () => {
    const detected = await detectSources(FIXTURE_DIR);
    const tailwind = detected.find((d) => d.source.id === 'tailwind')!;
    const cssVars = detected.find((d) => d.source.id === 'css-vars')!;
    expect(tailwind.result.file).toBe(path.join(FIXTURE_DIR, 'tailwind.config.js'));
    expect(cssVars.result.file).toBe(path.join(FIXTURE_DIR, 'src', 'styles', 'variables.css'));
  });
});

describe('detectSources — ranking progression as sources disappear', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uiseal-detect-progression-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('ranks css-vars highest once no tailwind.config is present', async () => {
    fs.mkdirSync(path.join(tmpDir, 'src', 'styles'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'styles', 'variables.css'),
      fs.readFileSync(path.join(FIXTURE_DIR, 'src', 'styles', 'variables.css'), 'utf8'),
    );

    const detected = await detectSources(tmpDir);
    expect(detected.map((d) => d.source.id)).toEqual(['css-vars', 'code-scan']);
  });

  it('falls back to code-scan only once neither Tailwind nor CSS vars are present', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'Button.tsx'),
      fs.readFileSync(path.join(FIXTURE_DIR, 'src', 'Button.tsx'), 'utf8'),
    );

    const detected = await detectSources(tmpDir);
    expect(detected.map((d) => d.source.id)).toEqual(['code-scan']);
  });
});

describe('--from tailwind — extract against the fixture', () => {
  it('produces SourceTokens matching the fixture tailwind.config.js', async () => {
    const tokens = await getSourceById('tailwind')!.extract(FIXTURE_DIR);

    expect(tokens.colors).toEqual({ primary: '#02c39a', 'blue-500': '#3b82f6' });
    expect(tokens.spacing).toEqual([16, 32]); // 1rem, 2rem @ 16px base
    expect(tokens.radii).toEqual([4]); // 0.25rem
    expect(tokens.fontFamilies).toEqual(['Inter']);
  });
});

describe('--from css-vars — extract against the fixture', () => {
  it('produces SourceTokens with semantic names from the fixture variables.css', async () => {
    const tokens = await getSourceById('css-vars')!.extract(FIXTURE_DIR);

    expect(tokens.colors).toEqual({ 'color-accent': '#ff6600' });
    expect(tokens.spacing).toEqual([8, 16]);
  });
});
