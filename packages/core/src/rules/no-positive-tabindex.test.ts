import { describe, it, expect } from 'vitest';
import { analyze } from '../runner.js';
import { noPositiveTabindex } from './no-positive-tabindex.js';
import type { uisealConfig } from '../config/schema.js';

const baseConfig: uisealConfig = {
  tokens: { colors: {}, spacing: [], fontSizes: [], fontFamilies: [], radii: [] },
  rules: {},
  ignore: [],
};

async function run(code: string) {
  const { violations } = await analyze({ files: new Map([['test.tsx', code]]), config: baseConfig, rules: [noPositiveTabindex] });
  return violations;
}

describe('no-positive-tabindex', () => {
  it('flags tabIndex={1}', async () => {
    const vs = await run(`export function A() { return <div tabIndex={1} />; }`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.ruleId).toBe('no-positive-tabindex');
    expect(vs[0]!.severity).toBe('warning');
  });

  it('flags tabIndex={5}', async () => {
    const vs = await run(`export function A() { return <button tabIndex={5}>Click</button>; }`);
    expect(vs).toHaveLength(1);
  });

  it('passes for tabIndex={0}', async () => {
    const vs = await run(`export function A() { return <div tabIndex={0} />; }`);
    expect(vs).toHaveLength(0);
  });

  it('passes for tabIndex={-1}', async () => {
    const vs = await run(`export function A() { return <div tabIndex={-1} />; }`);
    expect(vs).toHaveLength(0);
  });

  it('passes when no tabIndex present', async () => {
    const vs = await run(`export function A() { return <div className="foo" />; }`);
    expect(vs).toHaveLength(0);
  });
});
