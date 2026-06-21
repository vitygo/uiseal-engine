import { describe, it, expect } from 'vitest';
import { analyze } from '../runner.js';
import { noArbitraryRadius } from './no-arbitrary-radius.js';
import type { uisealConfig } from '../config/schema.js';

const baseConfig: uisealConfig = {
  tokens: {
    colors: {},
    spacing: [4, 8, 16],
    fontSizes: [14, 16],
    fontFamilies: ['Inter'],
    radii: [0, 4, 8, 999],
  },
  rules: {},
  ignore: [],
};

async function run(code: string, ext: 'css' | 'tsx' = 'css') {
  const { violations } = await analyze({
    files: new Map([[`test.${ext}`, code]]),
    config: baseConfig,
    rules: [noArbitraryRadius],
  });
  return violations;
}

describe('no-arbitrary-radius', () => {
  it('flags a px radius not in tokens (warn severity)', async () => {
    const vs = await run('.a { border-radius: 6px; }');
    expect(vs).toHaveLength(1);
    expect(vs[0]!.ruleId).toBe('no-arbitrary-radius');
    expect(vs[0]!.severity).toBe('warning');
    expect(vs[0]!.message).toContain('6px');
  });

  it('passes for a px radius in tokens', async () => {
    const vs = await run('.a { border-radius: 4px; }');
    expect(vs).toHaveLength(0);
  });

  it('passes for 0', async () => {
    const vs = await run('.a { border-radius: 0; }');
    expect(vs).toHaveLength(0);
  });

  it('passes for 50% (pill shape)', async () => {
    const vs = await run('.a { border-radius: 50%; }');
    expect(vs).toHaveLength(0);
  });

  it('passes for CSS variable', async () => {
    const vs = await run('.a { border-radius: var(--radius-lg); }');
    expect(vs).toHaveLength(0);
  });

  it('passes for 999px when it is in the token list', async () => {
    const vs = await run('.a { border-radius: 999px; }');
    expect(vs).toHaveLength(0);
  });

  it('flags a rem value', async () => {
    const vs = await run('.a { border-radius: 0.5rem; }');
    expect(vs).toHaveLength(1);
  });

  it('checks each part of a multi-value shorthand', async () => {
    // 4px is allowed; 6px is not
    const vs = await run('.a { border-radius: 4px 6px; }');
    expect(vs).toHaveLength(1);
    expect(vs[0]!.message).toContain('6px');
  });

  it('passes multi-value shorthand where all parts are tokens', async () => {
    const vs = await run('.a { border-radius: 4px 8px; }');
    expect(vs).toHaveLength(0);
  });

  it('does not flag other properties', async () => {
    const vs = await run('.a { margin: 6px; }');
    expect(vs).toHaveLength(0);
  });

  it('flags arbitrary border-top-left-radius not in tokens', async () => {
    const vs = await run('.a { border-top-left-radius: 6px; }');
    expect(vs).toHaveLength(1);
    expect(vs[0]!.ruleId).toBe('no-arbitrary-radius');
    expect(vs[0]!.message).toContain('border-top-left-radius');
    expect(vs[0]!.message).toContain('6px');
  });

  it('passes for border-top-left-radius in tokens', async () => {
    const vs = await run('.a { border-top-left-radius: 4px; }');
    expect(vs).toHaveLength(0);
  });

  it('flags arbitrary border-bottom-right-radius not in tokens', async () => {
    const vs = await run('.a { border-bottom-right-radius: 3px; }');
    expect(vs).toHaveLength(1);
    expect(vs[0]!.message).toContain('border-bottom-right-radius');
  });

  it('passes border-top-right-radius for 0', async () => {
    const vs = await run('.a { border-top-right-radius: 0; }');
    expect(vs).toHaveLength(0);
  });

  it('flags arbitrary radius in JSX inline style', async () => {
    const code = `export function A() {
  return <div style={{ borderRadius: '6px' }} />;
}`;
    const vs = await run(code, 'tsx');
    expect(vs.some((v) => v.ruleId === 'no-arbitrary-radius')).toBe(true);
  });

  it('passes token radius in JSX inline style', async () => {
    const code = `export function A() {
  return <div style={{ borderRadius: '4px' }} />;
}`;
    const vs = await run(code, 'tsx');
    expect(vs).toHaveLength(0);
  });
});
