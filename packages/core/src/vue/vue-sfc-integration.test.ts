import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyze } from '../runner.js';
import { applyFixes } from '../fixer/apply-fixes.js';
import { noHardcodedColor } from '../rules/no-hardcoded-color.js';
import { noArbitrarySpacing } from '../rules/no-arbitrary-spacing.js';
import { noArbitraryFontSize } from '../rules/no-arbitrary-font-size.js';
import { noTailwindArbitrary } from '../rules/no-tailwind-arbitrary.js';
import type { uisealConfig } from '../config/schema.js';

const FIXTURE_FILE = path.resolve(import.meta.dirname, '../__fixtures__/vue-fixture/Card.vue');

const config: uisealConfig = {
  tokens: {
    colors: {},
    spacing: [4, 8, 12, 16, 24],
    fontSizes: [12, 14, 16, 18, 24],
    fontFamilies: ['Inter'],
    radii: [4, 8, 12],
  },
  rules: {},
  ignore: [],
};

const rules = [noHardcodedColor, noArbitrarySpacing, noArbitraryFontSize, noTailwindArbitrary];

async function analyzeFixture(filePath: string) {
  const { violations } = await analyze({
    files: new Map([[filePath, fs.readFileSync(filePath, 'utf8')]]),
    config,
    rules,
  });
  return violations;
}

describe('Vue SFC — full integration (style blocks + template inline styles + Tailwind)', () => {
  it('finds exactly the 12 expected violations, all attributed to the .vue file', async () => {
    const vs = await analyzeFixture(FIXTURE_FILE);
    expect(vs).toHaveLength(12);
    for (const v of vs) expect(v.file).toBe(FIXTURE_FILE);
  });

  it('reports every violation at the correct .vue file line — never a block-relative line', async () => {
    const vs = await analyzeFixture(FIXTURE_FILE);
    const lines = vs.map((v) => v.line).sort((a, b) => a - b);
    // Plain <style> (line 14), scss <style> ($bg 19, background never flagged,
    // padding 21, nested margin 22), template :style (line 2 x2), template
    // static style (line 3 x2), template class (line 2 x2), template :class
    // (line 4).
    expect(lines).toEqual([2, 2, 2, 2, 3, 3, 4, 14, 14, 19, 21, 22]);
  });

  it('never flags anything from the <script> block', async () => {
    const vs = await analyzeFixture(FIXTURE_FILE);
    expect(vs.some((v) => v.line === 9 || v.line === 10)).toBe(false);
  });

  it('populates fix.suggested for font-size and Tailwind classes with a nearby token, not for far-off spacing/color', async () => {
    const vs = await analyzeFixture(FIXTURE_FILE);

    const fontSize = vs.find((v) => v.ruleId === 'no-arbitrary-font-size');
    expect(fontSize?.fix?.suggested).toBe('14px');

    const mt = vs.find((v) => v.oldValue === 'mt-[13px]');
    expect(mt?.fix?.suggested).toBe('mt-[12px]');

    const rounded = vs.find((v) => v.oldValue === 'rounded-[7px]');
    expect(rounded?.fix?.suggested).toBe('rounded-[8px]');

    const bgArbitrary = vs.find((v) => v.oldValue === 'bg-[#ff5733]');
    expect(bgArbitrary?.fix).toBeUndefined(); // no color tokens configured

    const spacingViolations = vs.filter((v) => v.ruleId === 'no-arbitrary-spacing');
    expect(spacingViolations.every((v) => v.fix === undefined)).toBe(true);
  });

  it('never flags standard Tailwind utilities (px-4, text-blue-500)', async () => {
    const vs = await analyzeFixture(FIXTURE_FILE);
    const flagged = vs.map((v) => v.oldValue);
    expect(flagged).not.toContain('px-4');
    expect(flagged).not.toContain('text-blue-500');
  });
});

describe('Vue SFC — --fix end to end', () => {
  let tmpFile: string;

  beforeEach(() => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uiseal-vue-fix-'));
    tmpFile = path.join(tmpDir, 'Card.vue');
    fs.copyFileSync(FIXTURE_FILE, tmpFile);
  });

  afterEach(() => {
    fs.rmSync(path.dirname(tmpFile), { recursive: true, force: true });
  });

  it('fixes the font-size in <template> AND the Tailwind classes in the same pass, leaving unfixable violations untouched', async () => {
    const vs = await analyzeFixture(tmpFile);
    const results = applyFixes(vs, { dryRun: false });

    const applied = results[0]!.applied;
    expect(applied.map((a) => `${a.oldValue} -> ${a.newValue}`).sort()).toEqual(
      ['15px -> 14px', 'mt-[13px] -> mt-[12px]', 'rounded-[7px] -> rounded-[8px]'].sort(),
    );

    const fixed = fs.readFileSync(tmpFile, 'utf8');
    expect(fixed).toContain('font-size: 14px');
    expect(fixed).toContain('mt-[12px]');
    expect(fixed).toContain("'rounded-[8px]': isRound");

    // Untouched: far-off spacing/color values (no fix existed for them),
    // and standard Tailwind utilities.
    expect(fixed).toContain('padding: 99px');
    expect(fixed).toContain('padding: 88px');
    expect(fixed).toContain('margin: 77px');
    expect(fixed).toContain('#00ff00');
    expect(fixed).toContain('bg-[#ff5733]');
    expect(fixed).toContain('px-4');
    expect(fixed).toContain('text-blue-500');
  });
});
