import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyze } from '../runner.js';
import { applyFixes } from '../fixer/apply-fixes.js';
import { noTailwindArbitrary } from '../rules/no-tailwind-arbitrary.js';
import type { uisealConfig } from '../config/schema.js';

const FIXTURE_FILE = path.resolve(
  import.meta.dirname,
  '../__fixtures__/tailwind-arbitrary-fixture/Card.tsx',
);

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

async function analyzeFixture(filePath: string) {
  const { violations } = await analyze({
    files: new Map([[filePath, fs.readFileSync(filePath, 'utf8')]]),
    config,
    rules: [noTailwindArbitrary],
  });
  return violations.filter((v) => v.ruleId === 'no-tailwind-arbitrary');
}

describe('no-tailwind-arbitrary — fixture detection', () => {
  it('flags exactly the 6 off-token arbitrary classes and nothing else', async () => {
    const vs = await analyzeFixture(FIXTURE_FILE);
    const flaggedClasses = vs.map((v) => v.oldValue).sort();

    expect(flaggedClasses).toEqual(
      ['bg-[#ff5733]', 'mt-[13px]', 'px-[99px]', 'rounded-[7px]', 'text-[#abc]', 'text-[15px]'].sort(),
    );
  });

  it('never flags standard utility classes (px-4, text-blue-500, mt-2, text-sm)', async () => {
    const vs = await analyzeFixture(FIXTURE_FILE);
    const messages = vs.map((v) => v.message).join('\n');
    for (const standard of ['px-4', 'text-blue-500', 'mt-2', 'text-sm']) {
      expect(messages).not.toContain(`'${standard}'`);
    }
  });

  it('categorizes each violation correctly', async () => {
    const vs = await analyzeFixture(FIXTURE_FILE);
    const byClass = new Map(vs.map((v) => [v.oldValue, v]));

    expect(byClass.get('mt-[13px]')!.message).toContain('spacing scale');
    expect(byClass.get('bg-[#ff5733]')!.message).toContain('color tokens');
    expect(byClass.get('rounded-[7px]')!.message).toContain('radius scale');
    expect(byClass.get('text-[15px]')!.message).toContain('font-size scale');
    expect(byClass.get('px-[99px]')!.message).toContain('spacing scale');
    expect(byClass.get('text-[#abc]')!.message).toContain('color tokens');
  });

  it('suggests nearest-token fixes where a close token exists, and none where too far', async () => {
    const vs = await analyzeFixture(FIXTURE_FILE);
    const byClass = new Map(vs.map((v) => [v.oldValue, v]));

    expect(byClass.get('mt-[13px]')!.fix?.suggested).toBe('mt-[12px]');
    expect(byClass.get('rounded-[7px]')!.fix?.suggested).toBe('rounded-[8px]');
    expect(byClass.get('text-[15px]')!.fix?.suggested).toBe('text-[14px]');
    expect(byClass.get('px-[99px]')!.fix).toBeUndefined();
    expect(byClass.get('bg-[#ff5733]')!.fix).toBeUndefined();
    expect(byClass.get('text-[#abc]')!.fix).toBeUndefined();
  });
});

describe('no-tailwind-arbitrary — --fix / --dry-run on the fixture', () => {
  let tmpFile: string;

  beforeEach(() => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uiseal-tw-fixture-'));
    tmpFile = path.join(tmpDir, 'Card.tsx');
    fs.copyFileSync(FIXTURE_FILE, tmpFile);
  });

  afterEach(() => {
    fs.rmSync(path.dirname(tmpFile), { recursive: true, force: true });
  });

  it('dry-run shows the suggested replacements without writing the file', async () => {
    const vs = await analyzeFixture(tmpFile);
    const before = fs.readFileSync(tmpFile, 'utf8');

    const results = applyFixes(vs, { dryRun: true });
    const applied = results[0]!.applied;

    expect(applied.map((a) => `${a.oldValue} -> ${a.newValue}`).sort()).toEqual(
      ['mt-[13px] -> mt-[12px]', 'rounded-[7px] -> rounded-[8px]', 'text-[15px] -> text-[14px]'].sort(),
    );
    expect(fs.readFileSync(tmpFile, 'utf8')).toBe(before);
  });

  it('--fix rewrites only the fixable arbitrary classes, leaving unfixable ones and standard utilities untouched', async () => {
    const vs = await analyzeFixture(tmpFile);
    applyFixes(vs, { dryRun: false });

    const fixed = fs.readFileSync(tmpFile, 'utf8');

    expect(fixed).toContain('mt-[12px]');
    expect(fixed).toContain('rounded-[8px]');
    expect(fixed).toContain('text-[14px]');

    // No fix existed for these — unchanged.
    expect(fixed).toContain('bg-[#ff5733]');
    expect(fixed).toContain('px-[99px]');
    expect(fixed).toContain("text-[#abc]");

    // Standard utilities untouched.
    expect(fixed).toContain('px-4');
    expect(fixed).toContain('text-blue-500');
    expect(fixed).toContain("'mt-2'");
    expect(fixed).toContain('text-sm');
  });
});
