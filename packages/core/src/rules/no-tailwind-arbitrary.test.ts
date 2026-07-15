import { describe, it, expect } from 'vitest';
import { analyze } from '../runner.js';
import { noTailwindArbitrary } from './no-tailwind-arbitrary.js';
import type { uisealConfig } from '../config/schema.js';

const baseConfig: uisealConfig = {
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

async function run(code: string, config = baseConfig) {
  const { violations } = await analyze({
    files: new Map([['test.tsx', code]]),
    config,
    rules: [noTailwindArbitrary],
  });
  return violations.filter((v) => v.ruleId === 'no-tailwind-arbitrary');
}

describe('no-tailwind-arbitrary — standard utilities never flagged', () => {
  it('does not flag standard utility classes', async () => {
    const vs = await run(
      `export const C = () => <div className="px-4 text-blue-500 mt-2 text-sm rounded-lg" />;`,
    );
    expect(vs).toHaveLength(0);
  });
});

describe('no-tailwind-arbitrary — arbitrary values off the token scale', () => {
  it('flags arbitrary spacing not in the scale', async () => {
    const vs = await run(`export const C = () => <div className="mt-[13px]" />;`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.message).toContain("mt-[13px]");
    expect(vs[0]!.message).toContain('spacing scale');
  });

  it('flags arbitrary color not in tokens', async () => {
    const vs = await run(`export const C = () => <div className="bg-[#ff5733]" />;`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.message).toContain('color tokens');
  });

  it('flags arbitrary radius not in the scale', async () => {
    const vs = await run(`export const C = () => <div className="rounded-[7px]" />;`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.message).toContain('radius scale');
  });

  it('flags arbitrary font-size not in the scale', async () => {
    const vs = await run(`export const C = () => <div className="text-[15px]" />;`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.message).toContain('font-size scale');
  });
});

describe('no-tailwind-arbitrary — arbitrary values ON the token scale are skipped', () => {
  it('does not flag an arbitrary spacing value that exactly matches a scale entry', async () => {
    const vs = await run(`export const C = () => <div className="mt-[12px]" />;`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag an arbitrary color that exactly matches a token', async () => {
    const vs = await run(`export const C = () => <div className="bg-[#3b82f6]" />;`);
    expect(vs).toHaveLength(0);
  });
});

describe('no-tailwind-arbitrary — className AST forms', () => {
  it('reads a static string literal', async () => {
    const vs = await run(`export const C = () => <div className="mt-[13px]" />;`);
    expect(vs).toHaveLength(1);
  });

  it('reads static quasis of a template literal and skips the dynamic part', async () => {
    const vs = await run(
      'export const C = ({dynamic}) => <div className={`px-4 ${dynamic} mt-[13px]`} />;',
    );
    expect(vs).toHaveLength(1);
    expect(vs[0]!.message).toContain('mt-[13px]');
  });

  it('reads string literal arguments of a cn()-style call, skipping non-literal args', async () => {
    const vs = await run(
      "export const C = ({cond}) => <div className={cn('px-4', cond && 'mt-2', 'mt-[13px]')} />;",
    );
    expect(vs).toHaveLength(1);
    expect(vs[0]!.message).toContain('mt-[13px]');
  });

  it('reads string concatenation via +', async () => {
    const vs = await run(`export const C = () => <div className={"px-4" + " mt-[13px]"} />;`);
    expect(vs).toHaveLength(1);
  });

  it('does not crash on a bare identifier className and finds nothing', async () => {
    const vs = await run('export const C = ({classes}) => <div className={classes} />;');
    expect(vs).toHaveLength(0);
  });

  it('also checks a plain "class" attribute name', async () => {
    const vs = await run(`export const C = () => <div class="mt-[13px]" />;`);
    expect(vs).toHaveLength(1);
  });
});
