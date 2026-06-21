import { describe, it, expect } from 'vitest';
import { analyze } from '../runner.js';
import { noMissingFormLabel } from './no-missing-form-label.js';
import type { uisealConfig } from '../config/schema.js';

const baseConfig: uisealConfig = {
  tokens: { colors: {}, spacing: [], fontSizes: [], fontFamilies: [], radii: [] },
  rules: {},
  ignore: [],
};

async function run(code: string) {
  const { violations } = await analyze({ files: new Map([['test.tsx', code]]), config: baseConfig, rules: [noMissingFormLabel] });
  return violations;
}

describe('no-missing-form-label', () => {
  it('flags <input> with no label attributes', async () => {
    const vs = await run(`export function A() { return <input type="text" />; }`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.ruleId).toBe('no-missing-form-label');
    expect(vs[0]!.severity).toBe('error');
  });

  it('flags <input> with no type and no label', async () => {
    const vs = await run(`export function A() { return <input placeholder="Search" />; }`);
    expect(vs).toHaveLength(1);
  });

  it('passes when input has aria-label', async () => {
    const vs = await run(`export function A() { return <input aria-label="Email address" />; }`);
    expect(vs).toHaveLength(0);
  });

  it('passes when input has aria-labelledby', async () => {
    const vs = await run(`export function A() { return <input aria-labelledby="email-label" />; }`);
    expect(vs).toHaveLength(0);
  });

  it('passes for type="submit"', async () => {
    const vs = await run(`export function A() { return <input type="submit" value="Submit" />; }`);
    expect(vs).toHaveLength(0);
  });

  it('passes for type="reset"', async () => {
    const vs = await run(`export function A() { return <input type="reset" />; }`);
    expect(vs).toHaveLength(0);
  });

  it('passes for type="button"', async () => {
    const vs = await run(`export function A() { return <input type="button" value="Click" />; }`);
    expect(vs).toHaveLength(0);
  });

  it('passes for type="hidden"', async () => {
    const vs = await run(`export function A() { return <input type="hidden" name="csrf" />; }`);
    expect(vs).toHaveLength(0);
  });

  it('flags <textarea> with no label attributes', async () => {
    const vs = await run(`export function A() { return <textarea />; }`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.ruleId).toBe('no-missing-form-label');
  });

  it('passes when textarea has aria-label', async () => {
    const vs = await run(`export function A() { return <textarea aria-label="Comments" />; }`);
    expect(vs).toHaveLength(0);
  });

  it('passes when textarea has aria-labelledby', async () => {
    const vs = await run(`export function A() { return <textarea aria-labelledby="comments-label" />; }`);
    expect(vs).toHaveLength(0);
  });

  it('flags <select> with no label attributes', async () => {
    const vs = await run(`export function A() { return <select><option>A</option></select>; }`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.ruleId).toBe('no-missing-form-label');
  });

  it('passes when select has aria-label', async () => {
    const vs = await run(`export function A() { return <select aria-label="Country"><option>A</option></select>; }`);
    expect(vs).toHaveLength(0);
  });
});
