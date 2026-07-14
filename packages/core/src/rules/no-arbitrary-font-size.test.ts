import { describe, it, expect } from 'vitest';
import { analyze } from '../runner.js';
import { noArbitraryFontSize } from './no-arbitrary-font-size.js';
import type { uisealConfig } from '../config/schema.js';

const baseConfig: uisealConfig = {
  tokens: {
    colors: {},
    spacing: [4, 8, 16],
    fontSizes: [12, 14, 16, 20, 24],
    fontFamilies: ['Inter'],
    radii: [4],
  },
  rules: {},
  ignore: [],
};

async function run(code: string, ext: 'css' | 'tsx' = 'css') {
  const { violations } = await analyze({
    files: new Map([[`test.${ext}`, code]]),
    config: baseConfig,
    rules: [noArbitraryFontSize],
  });
  return violations;
}

describe('no-arbitrary-font-size', () => {
  it('flags a px font-size not in tokens', async () => {
    const vs = await run('.a { font-size: 13px; }');
    expect(vs).toHaveLength(1);
    expect(vs[0]!.ruleId).toBe('no-arbitrary-font-size');
    expect(vs[0]!.message).toContain('13px');
  });

  it('passes for a px font-size in tokens', async () => {
    const vs = await run('.a { font-size: 14px; }');
    expect(vs).toHaveLength(0);
  });

  it('passes when value is a CSS variable', async () => {
    const vs = await run('.a { font-size: var(--text-sm); }');
    expect(vs).toHaveLength(0);
  });

  it('passes for rem font-size that converts to a token (0.875rem = 14px)', async () => {
    const vs = await run('.a { font-size: 0.875rem; }');
    expect(vs).toHaveLength(0);
  });

  it('passes for rem font-size that converts to a token (1rem = 16px)', async () => {
    const vs = await run('.a { font-size: 1rem; }');
    expect(vs).toHaveLength(0);
  });

  it('flags rem font-size whose px equivalent is not a token (0.5rem = 8px, not in fontSizes)', async () => {
    const vs = await run('.a { font-size: 0.5rem; }');
    expect(vs).toHaveLength(1);
  });

  it('flags an em font-size', async () => {
    const vs = await run('.a { font-size: 1.2em; }');
    expect(vs).toHaveLength(1);
  });

  it('does not flag other properties', async () => {
    const vs = await run('.a { line-height: 13px; }');
    expect(vs).toHaveLength(0);
  });

  it('flags a value just outside the scale but within threshold, with a suggested fix', async () => {
    // 21px is 1px from 20px (within the 2px threshold), unambiguously nearest.
    const vs = await run('.a { font-size: 21px; }');
    expect(vs).toHaveLength(1);
    expect(vs[0]!.fix).toEqual({ suggested: '20px' });
    expect(vs[0]!.message).toContain('20px');
  });

  it('flags a value far from any token with no suggested fix', async () => {
    const vs = await run('.a { font-size: 100px; }');
    expect(vs).toHaveLength(1);
    expect(vs[0]!.fix).toBeUndefined();
    expect(vs[0]!.message).not.toContain('Did you mean');
  });

  it('flags a rem value just outside the scale with a suggested fix (1.3125rem = 21px near 20px)', async () => {
    const vs = await run('.a { font-size: 1.3125rem; }');
    expect(vs).toHaveLength(1);
    expect(vs[0]!.fix).toEqual({ suggested: '20px' });
  });

  it('flags arbitrary font-size in JSX inline style', async () => {
    const code = `export function A() {
  return <p style={{ fontSize: '13px' }} />;
}`;
    const vs = await run(code, 'tsx');
    expect(vs.some((v) => v.ruleId === 'no-arbitrary-font-size')).toBe(true);
  });

  it('passes token font-size in JSX inline style', async () => {
    const code = `export function A() {
  return <p style={{ fontSize: '14px' }} />;
}`;
    const vs = await run(code, 'tsx');
    expect(vs).toHaveLength(0);
  });
});
