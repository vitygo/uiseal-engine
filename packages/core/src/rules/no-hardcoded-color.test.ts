import { describe, it, expect } from 'vitest';
import { analyze } from '../runner.js';
import { noHardcodedColor } from './no-hardcoded-color.js';
import type { uisealConfig } from '../config/schema.js';

const baseConfig: uisealConfig = {
  tokens: {
    colors: { '--primary': '#1a73e8', '--danger': '#d93025' },
    spacing: [4, 8, 16, 24],
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
    rules: [noHardcodedColor],
  });
  return violations;
}

describe('no-hardcoded-color — CSS', () => {
  it('flags a hex color on a color property', async () => {
    const vs = await run('.a { color: #ff0000; }');
    expect(vs).toHaveLength(1);
    expect(vs[0]!.ruleId).toBe('no-hardcoded-color');
    expect(vs[0]!.message).toContain('#ff0000');
  });

  it('flags an rgb() value', async () => {
    const vs = await run('.a { color: rgb(255,0,0); }');
    expect(vs).toHaveLength(1);
  });

  it('flags an hsl() value', async () => {
    const vs = await run('.a { color: hsl(0, 100%, 50%); }');
    expect(vs).toHaveLength(1);
  });

  it('flags background-color', async () => {
    const vs = await run('.a { background-color: #ffffff; }');
    expect(vs).toHaveLength(1);
    expect(vs[0]!.message).toContain('background-color');
  });

  it('flags border-color shorthand', async () => {
    const vs = await run('.a { border-color: #000; }');
    expect(vs).toHaveLength(1);
  });

  it('flags fill and stroke', async () => {
    const vs = await run('path { fill: #ff0000; stroke: #0000ff; }');
    expect(vs).toHaveLength(2);
  });

  it('passes when value uses var(--token)', async () => {
    const vs = await run('.a { color: var(--primary); }');
    expect(vs).toHaveLength(0);
  });

  it('passes for non-color properties', async () => {
    const vs = await run('.a { font-size: 14px; }');
    expect(vs).toHaveLength(0);
  });

  it('suggests closest token and includes fix when a near-match exists', async () => {
    // #1a73e8 is exactly the "primary" token in baseConfig
    const vs = await run('.a { color: #1a73e8; }');
    expect(vs).toHaveLength(1);
    expect(vs[0]!.fix?.suggested).toBe('var(--primary)');
    expect(vs[0]!.message).toContain('primary');
  });

  it('reports without fix when no close token exists', async () => {
    const vs = await run('.a { color: #ffff00; }');
    expect(vs).toHaveLength(1);
    expect(vs[0]!.fix).toBeUndefined();
  });
});

describe('no-hardcoded-color — JSX inline style', () => {
  it('flags hardcoded color in inline style object', async () => {
    const code = `export function A() {
  return <div style={{ color: '#ff0000' }} />;
}`;
    const vs = await run(code, 'tsx');
    expect(vs.some((v) => v.ruleId === 'no-hardcoded-color')).toBe(true);
  });

  it('passes when inline style uses a var token', async () => {
    const code = `export function A() {
  return <div style={{ color: 'var(--primary)' }} />;
}`;
    const vs = await run(code, 'tsx');
    expect(vs).toHaveLength(0);
  });
});

describe('no-hardcoded-color — JSX color-ish prop', () => {
  it('flags a hardcoded hex on a color attribute', async () => {
    const code = `export function A() {
  return <Icon color="#ff0000" />;
}`;
    const vs = await run(code, 'tsx');
    expect(vs.some((v) => v.ruleId === 'no-hardcoded-color')).toBe(true);
  });

  it('flags a hardcoded hex on a fill attribute', async () => {
    const code = `export function A() {
  return <path fill="#ff0000" />;
}`;
    const vs = await run(code, 'tsx');
    expect(vs.some((v) => v.ruleId === 'no-hardcoded-color')).toBe(true);
  });

  it('passes when a color-ish JSX prop uses var(--token)', async () => {
    const code = `export function A() {
  return <Icon color="var(--primary)" />;
}`;
    const vs = await run(code, 'tsx');
    expect(vs).toHaveLength(0);
  });

  it('passes for non-color-ish JSX props with hex-looking values', async () => {
    // "id" prop is not color-ish — should not be flagged
    const code = `export function A() {
  return <div id="#section" />;
}`;
    const vs = await run(code, 'tsx');
    expect(vs).toHaveLength(0);
  });
});
