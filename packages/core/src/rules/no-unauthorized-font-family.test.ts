import { describe, it, expect } from 'vitest';
import { analyze } from '../runner.js';
import { noUnauthorizedFontFamily } from './no-unauthorized-font-family.js';
import type { uisealConfig } from '../config/schema.js';

const baseConfig: uisealConfig = {
  tokens: {
    colors: {},
    spacing: [4, 8, 16],
    fontSizes: [14, 16],
    fontFamilies: ['Inter', 'Roboto Mono'],
    radii: [4],
  },
  rules: {},
  ignore: [],
};

async function run(code: string, ext: 'css' | 'tsx' = 'css') {
  const { violations } = await analyze({
    files: new Map([[`test.${ext}`, code]]),
    config: baseConfig,
    rules: [noUnauthorizedFontFamily],
  });
  return violations;
}

describe('no-unauthorized-font-family', () => {
  it('flags an unauthorized first font family', async () => {
    const vs = await run('.a { font-family: Arial, sans-serif; }');
    expect(vs).toHaveLength(1);
    expect(vs[0]!.ruleId).toBe('no-unauthorized-font-family');
    expect(vs[0]!.message).toContain('Arial');
  });

  it('passes when first family is authorized (exact match)', async () => {
    const vs = await run('.a { font-family: Inter, sans-serif; }');
    expect(vs).toHaveLength(0);
  });

  it('passes case-insensitively', async () => {
    const vs = await run('.a { font-family: inter, sans-serif; }');
    expect(vs).toHaveLength(0);
  });

  it('passes with double-quoted family name', async () => {
    const vs = await run('.a { font-family: "Inter", sans-serif; }');
    expect(vs).toHaveLength(0);
  });

  it('passes with single-quoted family name', async () => {
    const vs = await run(".a { font-family: 'Inter', sans-serif; }");
    expect(vs).toHaveLength(0);
  });

  it('passes with multi-word authorized family (case-insensitive)', async () => {
    const vs = await run('.a { font-family: "roboto mono", monospace; }');
    expect(vs).toHaveLength(0);
  });

  it('passes when value is a CSS variable', async () => {
    const vs = await run('.a { font-family: var(--font-sans); }');
    expect(vs).toHaveLength(0);
  });

  it('does not flag other properties', async () => {
    const vs = await run('.a { font-size: 14px; }');
    expect(vs).toHaveLength(0);
  });

  it('flags unauthorized font-family in JSX inline style', async () => {
    const code = `export function A() {
  return <p style={{ fontFamily: 'Arial, sans-serif' }} />;
}`;
    const vs = await run(code, 'tsx');
    expect(vs.some((v) => v.ruleId === 'no-unauthorized-font-family')).toBe(true);
  });

  it('passes authorized font-family in JSX inline style', async () => {
    const code = `export function A() {
  return <p style={{ fontFamily: 'Inter, sans-serif' }} />;
}`;
    const vs = await run(code, 'tsx');
    expect(vs).toHaveLength(0);
  });
});
