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

const FIXTURE_DIR = path.resolve(import.meta.dirname, '../__fixtures__/angular-fixture');

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

async function analyzeDir(dir: string) {
  const names = ['button.component.ts', 'card.component.ts', 'card.component.scss', 'card.component.html', 'utils.ts'];
  const files = new Map<string, string>();
  for (const name of names) {
    files.set(path.join(dir, name), fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8'));
  }
  const { violations } = await analyze({ files, config, rules });
  return violations;
}

describe('Angular fixture — inline everything (button.component.ts)', () => {
  it('finds exactly the 8 expected violations from styles + template', async () => {
    const vs = await analyzeDir(FIXTURE_DIR);
    const buttonVs = vs.filter((v) => v.file.endsWith('button.component.ts'));
    expect(buttonVs).toHaveLength(8);
  });

  it('reports every violation at the correct .component.ts line', async () => {
    const vs = (await analyzeDir(FIXTURE_DIR)).filter((v) => v.file.endsWith('button.component.ts'));
    const lines = vs.map((v) => v.line).sort((a, b) => a - b);
    // Style block: .btn{...} line 6 (color, padding, radius), .icon{...} line 7 (font-size).
    // Template: <button ...> line 10 (class mt-[13px], ngStyle color, style.margin.px),
    // <span ...> line 15 (ngClass bg).
    expect(lines).toEqual([6, 6, 6, 7, 10, 10, 10, 15]);
  });

  it('populates fix.suggested only where a rule computes its own nearest token (radius, font-size, Tailwind)', async () => {
    const vs = (await analyzeDir(FIXTURE_DIR)).filter((v) => v.file.endsWith('button.component.ts'));

    const radius = vs.find((v) => v.ruleId === 'no-arbitrary-radius');
    expect(radius?.fix?.suggested).toBe('8px');

    const fontSize = vs.find((v) => v.ruleId === 'no-arbitrary-font-size');
    expect(fontSize?.fix?.suggested).toBe('14px');

    const mt = vs.find((v) => v.oldValue === 'mt-[13px]');
    expect(mt?.fix?.suggested).toBe('mt-[12px]');

    // no-arbitrary-spacing never sets fix, in any context (pre-existing,
    // not Angular-specific — see the Vue integration test's same finding).
    const spacingViolations = vs.filter((v) => v.ruleId === 'no-arbitrary-spacing');
    expect(spacingViolations.length).toBeGreaterThan(0);
    expect(spacingViolations.every((v) => v.fix === undefined)).toBe(true);

    // No color tokens configured -> color violations are always fix-less.
    const colorViolations = vs.filter((v) => v.ruleId === 'no-hardcoded-color');
    expect(colorViolations.every((v) => v.fix === undefined)).toBe(true);
  });

  it('never flags standard Tailwind utilities (px-4) or the plain "btn" class', async () => {
    const vs = (await analyzeDir(FIXTURE_DIR)).filter((v) => v.file.endsWith('button.component.ts'));
    const flagged = vs.map((v) => v.oldValue);
    expect(flagged).not.toContain('px-4');
    expect(flagged).not.toContain('btn');
  });
});

describe('Angular fixture — external files (card.component.*)', () => {
  it('picks up card.component.scss via the existing SCSS parser, unaffected by Angular support', async () => {
    const vs = (await analyzeDir(FIXTURE_DIR)).filter((v) => v.file.endsWith('card.component.scss'));
    expect(vs).toHaveLength(3); // $bg color, padding 88px, nested margin 77px
    expect(vs.map((v) => v.line).sort((a, b) => a - b)).toEqual([2, 4, 5]);
  });

  it('picks up card.component.html as its own file and analyzes its template', async () => {
    const vs = (await analyzeDir(FIXTURE_DIR)).filter((v) => v.file.endsWith('card.component.html'));
    expect(vs.map((v) => v.oldValue ?? v.ruleId).sort()).toEqual(['mt-[13px]', 'no-hardcoded-color'].sort());
    // Single-line external template -> line 1, no offset needed.
    expect(vs.every((v) => v.line === 1)).toBe(true);
  });

  it('produces no violations from card.component.ts itself (only external references, nothing inline)', async () => {
    const vs = (await analyzeDir(FIXTURE_DIR)).filter((v) => v.file.endsWith('card.component.ts'));
    expect(vs).toHaveLength(0);
  });
});

describe('Angular fixture — plain .ts is never scanned', () => {
  it('produces zero violations for utils.ts despite containing a hardcoded color', async () => {
    const vs = (await analyzeDir(FIXTURE_DIR)).filter((v) => v.file.endsWith('utils.ts'));
    expect(vs).toHaveLength(0);
  });
});

describe('Angular fixture — --fix end to end', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uiseal-angular-fix-'));
    for (const name of ['button.component.ts', 'card.component.ts', 'card.component.scss', 'card.component.html']) {
      fs.copyFileSync(path.join(FIXTURE_DIR, name), path.join(tmpDir, name));
    }
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('fixes the inline style AND the template Tailwind class in button.component.ts in the same pass', async () => {
    const vs = await analyzeDir(tmpDir);
    const results = applyFixes(vs, { dryRun: false });

    const buttonResult = results.find((r) => r.file.endsWith('button.component.ts'))!;
    // padding: 13px is inside the real style block, which — unlike template
    // inline styles — DOES feed the spacing-near-token post-analyzer, so it
    // gets upgraded with a fix too (13 is within threshold of 12); this
    // mirrors the exact same finding from the Vue integration test.
    expect(buttonResult.applied.map((a) => `${a.oldValue} -> ${a.newValue}`).sort()).toEqual(
      ['7px -> 8px', '13px -> 12px', '15px -> 14px', 'mt-[13px] -> mt-[12px]'].sort(),
    );

    const fixed = fs.readFileSync(path.join(tmpDir, 'button.component.ts'), 'utf8');
    expect(fixed).toContain('border-radius: 8px');
    expect(fixed).toContain('padding: 12px');
    expect(fixed).toContain('font-size: 14px');
    expect(fixed).toContain('mt-[12px]');
    // Unfixed values untouched: [style.margin.px]="9" (template inline —
    // no spacing-near-token there) and the hardcoded colors (no color
    // tokens configured).
    expect(fixed).toContain('margin.px]="9"');
    expect(fixed).toContain('#ff0000');
    expect(fixed).toContain('px-4');
  });
});
