import { describe, it, expect } from 'vitest';
import { analyze } from '../runner.js';
import { applyFixes } from '../fixer/apply-fixes.js';
import { noTailwindArbitrary } from './no-tailwind-arbitrary.js';
import type { uisealConfig } from '../config/schema.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

describe('no-tailwind-arbitrary — fix suggestions (Approach A: nearest raw value)', () => {
  it('suggests the nearest on-scale spacing value, rebuilt into the bracket', async () => {
    const vs = await run(`export const C = () => <div className="mt-[13px]" />;`);
    expect(vs[0]!.oldValue).toBe('mt-[13px]');
    expect(vs[0]!.fix?.suggested).toBe('mt-[12px]');
    expect(vs[0]!.message).toContain("Did you mean 'mt-[12px]'");
  });

  it('suggests the nearest on-scale radius value', async () => {
    const vs = await run(`export const C = () => <div className="rounded-[7px]" />;`);
    expect(vs[0]!.fix?.suggested).toBe('rounded-[8px]');
  });

  it('suggests the nearest on-scale font-size value', async () => {
    const vs = await run(`export const C = () => <div className="text-[15px]" />;`);
    expect(vs[0]!.fix?.suggested).toBe('text-[14px]');
  });

  it('suggests the nearest color token hex, rebuilt into the bracket', async () => {
    // #3c82f7 is one bit off from the blue-500 token (#3b82f6) — well within
    // the perceptual-distance threshold findClosestColorToken uses.
    const vs = await run(`export const C = () => <div className="bg-[#3c82f7]" />;`);
    expect(vs[0]!.fix?.suggested).toBe('bg-[#3b82f6]');
  });

  it('has no fix when the value is too far from anything in the scale', async () => {
    const vs = await run(`export const C = () => <div className="mt-[99px]" />;`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.fix).toBeUndefined();
    expect(vs[0]!.message).not.toContain('Did you mean');
  });

  it('preserves variant/important/negative prefixes outside the brackets when rebuilding the fix', async () => {
    const vs = await run(`export const C = () => <div className="md:hover:!mt-[13px]" />;`);
    expect(vs[0]!.oldValue).toBe('md:hover:!mt-[13px]');
    expect(vs[0]!.fix?.suggested).toBe('md:hover:!mt-[12px]');
  });

  it('rebuilds an arbitrary-property fix, keeping "property:" intact', async () => {
    const vs = await run(`export const C = () => <div className="[padding:13px]" />;`);
    expect(vs[0]!.fix?.suggested).toBe('[padding:12px]');
  });
});

describe('no-tailwind-arbitrary — applyFixes works on a substring within className', () => {
  it('replaces only the arbitrary class, leaving the rest of className untouched', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uiseal-tw-fix-'));
    try {
      const file = path.join(tmpDir, 'Card.tsx');
      fs.writeFileSync(
        file,
        'export const C = () => <div className="mt-4 mt-[13px] text-blue-500" />;\n',
      );

      const { violations } = await analyze({
        files: new Map([[file, fs.readFileSync(file, 'utf8')]]),
        config: baseConfig,
        rules: [noTailwindArbitrary],
      });

      const results = applyFixes(violations, { dryRun: false });
      expect(results[0]!.applied).toHaveLength(1);

      const fixed = fs.readFileSync(file, 'utf8');
      expect(fixed).toContain('className="mt-4 mt-[12px] text-blue-500"');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
