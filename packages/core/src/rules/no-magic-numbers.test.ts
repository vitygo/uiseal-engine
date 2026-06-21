import { describe, it, expect } from 'vitest';
import { analyze } from '../runner.js';
import { noMagicNumbers } from './no-magic-numbers.js';
import type { uisealConfig } from '../config/schema.js';

const baseConfig: uisealConfig = {
  tokens: { colors: {}, spacing: [], fontSizes: [], fontFamilies: [], radii: [] },
  rules: {},
  ignore: [],
};

async function run(code: string) {
  const { violations } = await analyze({
    files: new Map([['test.tsx', code]]),
    config: baseConfig,
    rules: [noMagicNumbers],
  });
  return violations;
}

describe('no-magic-numbers — flag cases', () => {
  it('flags magic number in binary expression (multiplication)', async () => {
    const vs = await run(`const s = days * 86400;`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.ruleId).toBe('no-magic-numbers');
    expect(vs[0]!.message).toContain('86400');
    expect(vs[0]!.severity).toBe('warning');
  });

  it('flags magic number as a call expression argument', async () => {
    const vs = await run(`setTimeout(fn, 3600000);`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.message).toContain('3600000');
  });

  it('flags magic number in ternary consequent', async () => {
    const vs = await run(`const x = cond ? 86400 : 0;`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.message).toContain('86400');
  });

  it('flags magic number in return statement', async () => {
    const vs = await run(`function getTimeout() { return 86400; }`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.message).toContain('86400');
  });

  it('flags magic number in ternary alternate', async () => {
    const vs = await run(`const x = cond ? 0 : 3600;`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.message).toContain('3600');
  });

  it('flags magic number in addition expression', async () => {
    const vs = await run(`const x = offset + 7;`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.message).toContain('7');
  });
});

describe('no-magic-numbers — safe cases', () => {
  it('does not flag safe values 0, 1, 2, -1', async () => {
    expect(await run(`const a = x * 0;`)).toHaveLength(0);
    expect(await run(`const b = x + 1;`)).toHaveLength(0);
    expect(await run(`const c = x - 2;`)).toHaveLength(0);
    expect(await run(`const d = x + -1;`)).toHaveLength(0);
  });

  it('does not flag number in variable declaration (not in arithmetic)', async () => {
    const vs = await run(`const MAX = 86400;`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag number as object property value', async () => {
    const vs = await run(`const cfg = { timeout: 86400 };`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag array index access', async () => {
    const vs = await run(`const item = arr[3];`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag default parameter value', async () => {
    const vs = await run(`function foo(n = 86400) { return n; }`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag JSX attribute numeric value', async () => {
    const vs = await run(`export function C() { return <Icon size={24} />; }`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag number in array literal (not a call arg)', async () => {
    const vs = await run(`const arr = [100, 200, 300];`);
    expect(vs).toHaveLength(0);
  });
});
