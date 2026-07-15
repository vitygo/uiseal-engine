import { describe, it, expect } from 'vitest';
import { analyze } from '../runner.js';
import { noTailwindArbitrary } from '../rules/no-tailwind-arbitrary.js';
import type { uisealConfig } from '../config/schema.js';

const config: uisealConfig = {
  tokens: {
    colors: { 'blue-500': '#3b82f6' },
    spacing: [4, 8, 12, 16, 24],
    fontSizes: [12, 14, 16, 18, 24],
    fontFamilies: ['Inter'],
    radii: [4, 8, 12],
  },
  rules: {},
  ignore: [],
};

async function run(code: string, rules = [noTailwindArbitrary]) {
  const { violations } = await analyze({
    files: new Map([['Card.vue', code]]),
    config,
    rules,
  });
  return violations.filter((v) => v.ruleId === 'no-tailwind-arbitrary');
}

describe('Vue template — class= and :class= Tailwind arbitrary checking', () => {
  const src = [
    '<template>', // 1
    '  <div class="px-4 mt-[13px] text-blue-500 bg-[#ff5733]">', // 2
    '    <span :class="{ \'rounded-[7px]\': isRound }">Hello</span>', // 3
    '  </div>', // 4
    '</template>', // 5
    '',
  ].join('\n');

  it('flags arbitrary classes in a static class= attribute', async () => {
    const vs = await run(src);
    const flagged = vs.map((v) => v.oldValue);
    expect(flagged).toContain('mt-[13px]');
    expect(flagged).toContain('bg-[#ff5733]');
  });

  it('never flags standard utilities (px-4, text-blue-500)', async () => {
    const vs = await run(src);
    const flagged = vs.map((v) => v.oldValue);
    expect(flagged).not.toContain('px-4');
    expect(flagged).not.toContain('text-blue-500');
  });

  it('flags an arbitrary class used as an object key in :class', async () => {
    const vs = await run(src);
    const flagged = vs.map((v) => v.oldValue);
    expect(flagged).toContain('rounded-[7px]');
  });

  it('reports correct .vue file line numbers for each binding', async () => {
    const vs = await run(src);
    const byClass = new Map(vs.map((v) => [v.oldValue, v.line]));
    expect(byClass.get('mt-[13px]')).toBe(2);
    expect(byClass.get('bg-[#ff5733]')).toBe(2);
    expect(byClass.get('rounded-[7px]')).toBe(3);
  });

  it('does not run at all when no-tailwind-arbitrary is not in the requested rules', async () => {
    const vs = await run(src, []);
    expect(vs).toHaveLength(0);
  });
});

describe('Vue template — :class array form with a ternary', () => {
  it('checks both branches of a ternary inside an array binding', async () => {
    const src =
      '<template><div :class="[\'px-4\', cond ? \'mt-[13px]\' : \'mt-2\']">X</div></template>\n';
    const vs = await run(src);
    expect(vs.map((v) => v.oldValue)).toContain('mt-[13px]');
  });
});

describe('Vue template — fix suggestions work the same as JSX', () => {
  it('suggests the nearest on-scale value, rebuilt into the bracket', async () => {
    const src = '<template><div class="mt-[13px]" /></template>\n';
    const vs = await run(src);
    expect(vs[0]!.fix?.suggested).toBe('mt-[12px]');
  });
});
