import { describe, it, expect } from 'vitest';
import { analyze } from '../runner.js';
import { noDivButton } from './no-div-button.js';
import type { uisealConfig } from '../config/schema.js';

const baseConfig: uisealConfig = {
  tokens: { colors: {}, spacing: [], fontSizes: [], fontFamilies: [], radii: [] },
  rules: {},
  ignore: [],
};

async function run(code: string) {
  const { violations } = await analyze({ files: new Map([['test.tsx', code]]), config: baseConfig, rules: [noDivButton] });
  return violations;
}

describe('no-div-button', () => {
  it('flags <div onClick> without role and tabIndex', async () => {
    const vs = await run(`export function A() { return <div onClick={() => {}} />; }`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.ruleId).toBe('no-div-button');
    expect(vs[0]!.severity).toBe('warning');
  });

  it('flags <span onClick> without role and tabIndex', async () => {
    const vs = await run(`export function A() { return <span onClick={() => {}} />; }`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.ruleId).toBe('no-div-button');
  });

  it('flags <div onClick> with role="button" but no tabIndex', async () => {
    const vs = await run(`export function A() { return <div onClick={() => {}} role="button" />; }`);
    expect(vs).toHaveLength(1);
  });

  it('flags <div onClick> with tabIndex but no role="button"', async () => {
    const vs = await run(`export function A() { return <div onClick={() => {}} tabIndex={0} />; }`);
    expect(vs).toHaveLength(1);
  });

  it('flags <div onClick> with role="button" and tabIndex but no keyboard handler', async () => {
    const vs = await run(`export function A() { return <div onClick={() => {}} role="button" tabIndex={0} />; }`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.message).toContain('onKeyDown');
  });

  it('passes when div has role="button", tabIndex, and onKeyDown', async () => {
    const vs = await run(`export function A() { return <div onClick={() => {}} role="button" tabIndex={0} onKeyDown={() => {}} />; }`);
    expect(vs).toHaveLength(0);
  });

  it('passes when div has role="button", tabIndex, and onKeyPress', async () => {
    const vs = await run(`export function A() { return <div onClick={() => {}} role="button" tabIndex={0} onKeyPress={() => {}} />; }`);
    expect(vs).toHaveLength(0);
  });

  it('passes for <div> without onClick', async () => {
    const vs = await run(`export function A() { return <div className="card" />; }`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag other interactive elements', async () => {
    const vs = await run(`export function A() { return <button onClick={() => {}}>Click</button>; }`);
    expect(vs).toHaveLength(0);
  });
});
