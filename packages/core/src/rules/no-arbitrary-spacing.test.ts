import { describe, it, expect } from 'vitest';
import { analyze } from '../runner.js';
import { noArbitrarySpacing } from './no-arbitrary-spacing.js';
import type { uisealConfig } from '../config/schema.js';

const baseConfig: uisealConfig = {
  tokens: {
    colors: {},
    spacing: [0, 4, 8, 16, 24, 32],
    fontSizes: [14, 16, 18],
    fontFamilies: ['Inter'],
    radii: [4, 8],
  },
  rules: {},
  ignore: [],
};

async function run(code: string, ext: 'css' | 'tsx' = 'css') {
  const { violations } = await analyze({
    files: new Map([[`test.${ext}`, code]]),
    config: baseConfig,
    rules: [noArbitrarySpacing],
  });
  return violations;
}

describe('no-arbitrary-spacing', () => {
  it('flags a px value not in spacing tokens', async () => {
    const vs = await run('.a { padding: 37px; }');
    expect(vs).toHaveLength(1);
    expect(vs[0]!.ruleId).toBe('no-arbitrary-spacing');
    expect(vs[0]!.message).toContain('37px');
  });

  it('passes for a px value in spacing tokens', async () => {
    const vs = await run('.a { padding: 8px; }');
    expect(vs).toHaveLength(0);
  });

  it('passes for 0', async () => {
    const vs = await run('.a { margin: 0; }');
    expect(vs).toHaveLength(0);
  });

  it('passes for auto', async () => {
    const vs = await run('.a { margin: auto; }');
    expect(vs).toHaveLength(0);
  });

  it('passes for % values', async () => {
    const vs = await run('.a { top: 50%; }');
    expect(vs).toHaveLength(0);
  });

  it('passes for CSS variables', async () => {
    const vs = await run('.a { margin: var(--space-4); }');
    expect(vs).toHaveLength(0);
  });

  it('flags em values', async () => {
    const vs = await run('.a { margin: 1em; }');
    expect(vs).toHaveLength(1);
  });

  it('passes for rem value that converts to a spacing token (0.5rem = 8px)', async () => {
    const vs = await run('.a { padding: 0.5rem; }');
    expect(vs).toHaveLength(0);
  });

  it('passes for rem value that converts to a spacing token (1rem = 16px)', async () => {
    const vs = await run('.a { padding: 1rem; }');
    expect(vs).toHaveLength(0);
  });

  it('flags rem value whose px equivalent is not in the spacing scale (0.375rem = 6px)', async () => {
    const vs = await run('.a { padding: 0.375rem; }');
    expect(vs).toHaveLength(1);
  });

  it('flags gap with an arbitrary value', async () => {
    const vs = await run('.a { gap: 13px; }');
    expect(vs).toHaveLength(1);
  });

  it('checks each part of a multi-value shorthand', async () => {
    // 8px is allowed; 13px is not
    const vs = await run('.a { padding: 8px 13px; }');
    expect(vs).toHaveLength(1);
    expect(vs[0]!.message).toContain('13px');
  });

  it('passes a multi-value shorthand where all parts are tokens', async () => {
    const vs = await run('.a { margin: 8px 16px; }');
    expect(vs).toHaveLength(0);
  });

  it('passes a four-part shorthand with mixed allowed values', async () => {
    const vs = await run('.a { padding: 8px 0 16px auto; }');
    expect(vs).toHaveLength(0);
  });

  it('flags margin-top when value is not a token', async () => {
    const vs = await run('.a { margin-top: 5px; }');
    expect(vs).toHaveLength(1);
  });

  it('does not flag non-spacing properties', async () => {
    const vs = await run('.a { width: 13px; }');
    expect(vs).toHaveLength(0);
  });

  it('flags arbitrary spacing in JSX inline style', async () => {
    const code = `export function A() {
  return <div style={{ padding: '13px' }} />;
}`;
    const vs = await run(code, 'tsx');
    expect(vs.some((v) => v.ruleId === 'no-arbitrary-spacing')).toBe(true);
  });

  it('passes token spacing in JSX inline style', async () => {
    const code = `export function A() {
  return <div style={{ padding: '8px' }} />;
}`;
    const vs = await run(code, 'tsx');
    expect(vs).toHaveLength(0);
  });
});
