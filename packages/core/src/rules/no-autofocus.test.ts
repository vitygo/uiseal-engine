import { describe, it, expect } from 'vitest';
import { analyze } from '../runner.js';
import { noAutofocus } from './no-autofocus.js';
import type { uisealConfig } from '../config/schema.js';

const baseConfig: uisealConfig = {
  tokens: { colors: {}, spacing: [], fontSizes: [], fontFamilies: [], radii: [] },
  rules: {},
  ignore: [],
};

async function run(code: string) {
  const { violations } = await analyze({ files: new Map([['test.tsx', code]]), config: baseConfig, rules: [noAutofocus] });
  return violations;
}

describe('no-autofocus', () => {
  it('flags autoFocus on input', async () => {
    const vs = await run(`export function A() { return <input autoFocus />; }`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.ruleId).toBe('no-autofocus');
    expect(vs[0]!.severity).toBe('warning');
  });

  it('flags autoFocus on button', async () => {
    const vs = await run(`export function A() { return <button autoFocus>Click</button>; }`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.ruleId).toBe('no-autofocus');
  });

  it('flags autoFocus on any element', async () => {
    const vs = await run(`export function A() { return <div autoFocus />; }`);
    expect(vs).toHaveLength(1);
  });

  it('passes when autoFocus is absent', async () => {
    const vs = await run(`export function A() { return <input type="text" />; }`);
    expect(vs).toHaveLength(0);
  });

  it('passes for other props', async () => {
    const vs = await run(`export function A() { return <button disabled>Cancel</button>; }`);
    expect(vs).toHaveLength(0);
  });
});
