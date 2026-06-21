import { describe, it, expect } from 'vitest';
import { analyze } from '../runner.js';
import { noEmptyButton } from './no-empty-button.js';
import type { uisealConfig } from '../config/schema.js';

const baseConfig: uisealConfig = {
  tokens: { colors: {}, spacing: [], fontSizes: [], fontFamilies: [], radii: [] },
  rules: {},
  ignore: [],
};

async function run(code: string) {
  const { violations } = await analyze({ files: new Map([['test.tsx', code]]), config: baseConfig, rules: [noEmptyButton] });
  return violations;
}

describe('no-empty-button', () => {
  it('flags <button></button> with no content or label', async () => {
    const vs = await run(`export function A() { return <button></button>; }`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.ruleId).toBe('no-empty-button');
    expect(vs[0]!.severity).toBe('error');
  });

  it('flags <button> with only whitespace', async () => {
    const vs = await run(`export function A() { return <button>   </button>; }`);
    expect(vs).toHaveLength(1);
  });

  it('passes when button has text content', async () => {
    const vs = await run(`export function A() { return <button>Submit</button>; }`);
    expect(vs).toHaveLength(0);
  });

  it('passes when button has aria-label', async () => {
    const vs = await run(`export function A() { return <button aria-label="Close"><svg /></button>; }`);
    expect(vs).toHaveLength(0);
  });

  it('passes when button has aria-labelledby', async () => {
    const vs = await run(`export function A() { return <button aria-labelledby="label-id"></button>; }`);
    expect(vs).toHaveLength(0);
  });

  it('passes when button has child element (icon)', async () => {
    const vs = await run(`export function A() { return <button><Icon /></button>; }`);
    expect(vs).toHaveLength(0);
  });

  it('passes when button has an expression child', async () => {
    const vs = await run(`export function A({ label }: { label: string }) { return <button>{label}</button>; }`);
    expect(vs).toHaveLength(0);
  });
});
