import { describe, it, expect } from 'vitest';
import { analyze } from '../runner.js';
import { noImgWithoutAlt } from './no-img-without-alt.js';
import type { uisealConfig } from '../config/schema.js';

const baseConfig: uisealConfig = {
  tokens: { colors: {}, spacing: [], fontSizes: [], fontFamilies: [], radii: [] },
  rules: {},
  ignore: [],
};

async function run(code: string) {
  const { violations } = await analyze({ files: new Map([['test.tsx', code]]), config: baseConfig, rules: [noImgWithoutAlt] });
  return violations;
}

describe('no-img-without-alt', () => {
  it('flags <img> with no alt prop', async () => {
    const vs = await run(`export function A() { return <img src="photo.png" />; }`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.ruleId).toBe('no-img-without-alt');
    expect(vs[0]!.severity).toBe('error');
  });

  it('flags <img alt={undefined}>', async () => {
    const vs = await run(`export function A() { return <img src="photo.png" alt={undefined} />; }`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.ruleId).toBe('no-img-without-alt');
  });

  it('passes for alt="" (decorative image)', async () => {
    const vs = await run(`export function A() { return <img src="decoration.png" alt="" />; }`);
    expect(vs).toHaveLength(0);
  });

  it('passes for alt with descriptive text', async () => {
    const vs = await run(`export function A() { return <img src="hero.png" alt="Team photo" />; }`);
    expect(vs).toHaveLength(0);
  });

  it('passes for alt with expression value', async () => {
    const vs = await run(`export function A({ label }: { label: string }) { return <img src="x.png" alt={label} />; }`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag non-img elements', async () => {
    const vs = await run(`export function A() { return <div src="x.png" />; }`);
    expect(vs).toHaveLength(0);
  });
});
