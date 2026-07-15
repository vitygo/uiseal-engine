import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyze } from '../runner.js';
import { applyFixes } from '../fixer/apply-fixes.js';
import { noHardcodedColor } from '../rules/no-hardcoded-color.js';
import { noArbitrarySpacing } from '../rules/no-arbitrary-spacing.js';
import { noArbitraryFontSize } from '../rules/no-arbitrary-font-size.js';
import { noArbitraryRadius } from '../rules/no-arbitrary-radius.js';
import { noTailwindArbitrary } from '../rules/no-tailwind-arbitrary.js';
import type { uisealConfig } from '../config/schema.js';

const FIXTURE_FILE = path.resolve(import.meta.dirname, '../__fixtures__/svelte-fixture/Card.svelte');

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

const rules = [noHardcodedColor, noArbitrarySpacing, noArbitraryFontSize, noArbitraryRadius, noTailwindArbitrary];

async function analyzeFixture(filePath: string) {
  const { violations } = await analyze({
    files: new Map([[filePath, fs.readFileSync(filePath, 'utf8')]]),
    config,
    rules,
  });
  return violations;
}

describe('Svelte SFC — full integration (style block + template directives + Tailwind)', () => {
  it('reports every violation at a plausible .svelte file line, never inside <script>', async () => {
    const vs = await analyzeFixture(FIXTURE_FILE);
    for (const v of vs) {
      expect(v.file).toBe(FIXTURE_FILE);
      expect(v.line).toBeGreaterThanOrEqual(6); // nothing before the <style> block (script is lines 1-4)
      expect(v.line).not.toBe(2);
      expect(v.line).not.toBe(3);
    }
  });

  it('never flags standard Tailwind utilities (px-4) or the plain "container"/"active" classes', async () => {
    const vs = await analyzeFixture(FIXTURE_FILE);
    const flagged = vs.map((v) => v.oldValue);
    expect(flagged).not.toContain('px-4');
    expect(flagged).not.toContain('container');
  });

  it('flags the Tailwind arbitrary classes: mt-[13px], bg-[#ff5733], class:rounded-[3px], and text-[11px] inside {#if}', async () => {
    const vs = await analyzeFixture(FIXTURE_FILE);
    const flagged = vs.filter((v) => v.ruleId === 'no-tailwind-arbitrary').map((v) => v.oldValue);
    expect(flagged).toContain('mt-[13px]');
    expect(flagged).toContain('bg-[#ff5733]');
    expect(flagged).toContain('rounded-[3px]');
    expect(flagged).toContain('text-[11px]');
  });

  it('flags the static style="border-radius: 7px" attribute', async () => {
    const vs = await analyzeFixture(FIXTURE_FILE);
    const radius = vs.find((v) => v.ruleId === 'no-arbitrary-radius' && v.message.includes('7px'));
    expect(radius).toBeDefined();
    expect(radius!.line).toBe(16);
  });

  it('flags the style:color and style:padding directives', async () => {
    const vs = await analyzeFixture(FIXTURE_FILE);
    const color = vs.find((v) => v.ruleId === 'no-hardcoded-color' && v.message.includes('#ff0000'));
    expect(color).toBeDefined();
    expect(color!.line).toBe(17);

    const padding = vs.find((v) => v.ruleId === 'no-arbitrary-spacing' && v.message.includes('9px'));
    expect(padding).toBeDefined();
    expect(padding!.line).toBe(18);
  });

  it('flags the SCSS style block: $border color, 13px padding, 15px font-size', async () => {
    const vs = await analyzeFixture(FIXTURE_FILE);
    const color = vs.find((v) => v.ruleId === 'no-hardcoded-color' && v.message.includes('#333'));
    expect(color).toBeDefined();
    expect(color!.line).toBe(8);

    const fontSize = vs.find((v) => v.ruleId === 'no-arbitrary-font-size');
    expect(fontSize).toBeDefined();
    expect(fontSize!.line).toBe(11);
    expect(fontSize!.fix?.suggested).toBe('14px');
  });
});

describe('Svelte SFC — --fix end to end', () => {
  let tmpFile: string;

  beforeEach(() => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uiseal-svelte-fix-'));
    tmpFile = path.join(tmpDir, 'Card.svelte');
    fs.copyFileSync(FIXTURE_FILE, tmpFile);
  });

  afterEach(() => {
    fs.rmSync(path.dirname(tmpFile), { recursive: true, force: true });
  });

  it('fixes the style block AND the template Tailwind classes in the same pass', async () => {
    const vs = await analyzeFixture(tmpFile);
    const results = applyFixes(vs, { dryRun: false });

    const applied = results[0]!.applied;
    expect(applied.length).toBeGreaterThan(0);

    const fixed = fs.readFileSync(tmpFile, 'utf8');
    expect(fixed).toContain('font-size: 14px');
    expect(fixed).toContain('mt-[12px]');
    expect(fixed).toContain('border-radius: 8px');
    // Unfixed (no color tokens configured / no fix computed) stay put.
    expect(fixed).toContain('#ff0000');
    expect(fixed).toContain('bg-[#ff5733]');
  });
});
