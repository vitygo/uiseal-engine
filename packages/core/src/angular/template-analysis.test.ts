import { describe, it, expect } from 'vitest';
import { analyze } from '../runner.js';
import { noHardcodedColor } from '../rules/no-hardcoded-color.js';
import { noArbitrarySpacing } from '../rules/no-arbitrary-spacing.js';
import { noTailwindArbitrary } from '../rules/no-tailwind-arbitrary.js';
import type { uisealConfig } from '../config/schema.js';

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

const rules = [noHardcodedColor, noArbitrarySpacing, noTailwindArbitrary];

async function run(code: string, filePath = 'button.component.ts') {
  const { violations } = await analyze({
    files: new Map([[filePath, code]]),
    config,
    rules,
  });
  return violations;
}

describe('Angular inline template — [ngStyle], [style.X.unit], class, [ngClass]', () => {
  const src = [
    "import { Component } from '@angular/core';", // 1
    '', // 2
    '@Component({', // 3
    '  template: `', // 4
    '    <button class="btn px-4 mt-[13px]"', // 5
    '            [ngStyle]="{ color: \'#00ff00\' }"', // 6
    '            [style.margin.px]="9">', // 7
    '      Click me', // 8
    '    </button>', // 9
    '    <span [ngClass]="{ \'bg-[#ff5733]\': isActive }">Status</span>', // 10
    '  `', // 11
    '})', // 12
    'export class ButtonComponent { isActive = true; }', // 13
    '',
  ].join('\n');

  it('flags the Tailwind arbitrary class from a static class= attribute', async () => {
    const vs = await run(src);
    const flagged = vs.filter((v) => v.ruleId === 'no-tailwind-arbitrary').map((v) => v.oldValue);
    expect(flagged).toContain('mt-[13px]');
    expect(flagged).not.toContain('px-4');
  });

  it('flags the hardcoded color from [ngStyle]', async () => {
    const vs = await run(src);
    const color = vs.find((v) => v.ruleId === 'no-hardcoded-color');
    expect(color).toBeDefined();
    expect(color!.message).toContain('#00ff00');
  });

  it('flags the spacing value from [style.margin.px]="9"', async () => {
    const vs = await run(src);
    const spacing = vs.find((v) => v.ruleId === 'no-arbitrary-spacing');
    expect(spacing).toBeDefined();
    expect(spacing!.message).toContain('9px');
  });

  it('flags the Tailwind arbitrary class used as an [ngClass] object key', async () => {
    const vs = await run(src);
    const flagged = vs.filter((v) => v.ruleId === 'no-tailwind-arbitrary').map((v) => v.oldValue);
    expect(flagged).toContain('bg-[#ff5733]');
  });

  it('reports every template violation at the correct .component.ts line', async () => {
    const vs = await run(src);
    const byOldValue = new Map(vs.map((v) => [v.oldValue ?? v.message, v.line]));
    // The <button ...> tag spans lines 5-7; every attribute on it shares
    // the tag's own start line (5) — same "one shared position per
    // element" precedent as the Vue template adapter, not per-attribute.
    expect(byOldValue.get('mt-[13px]')).toBe(5);
    expect(byOldValue.get('bg-[#ff5733]')).toBe(10);
    const ngStyleColor = vs.find((v) => v.ruleId === 'no-hardcoded-color');
    expect(ngStyleColor!.line).toBe(5);
    const styleBinding = vs.find((v) => v.ruleId === 'no-arbitrary-spacing');
    expect(styleBinding!.line).toBe(5);
  });
});

describe('Angular inline template — static style= attribute', () => {
  it('flags an off-scale spacing value in a plain style attribute', async () => {
    const src = [
      '@Component({',
      '  template: `<p style="margin: 7px">Hello</p>`',
      '})',
      'export class C {}',
      '',
    ].join('\n');
    const vs = await run(src);
    expect(vs.some((v) => v.ruleId === 'no-arbitrary-spacing' && v.message.includes('7px'))).toBe(true);
  });
});

describe('Angular inline template — dynamic bindings are skipped, not crashed on', () => {
  it('does not crash on [ngStyle]="computedStyles()" and finds nothing in it', async () => {
    const src = [
      '@Component({',
      '  template: `<div [ngStyle]="computedStyles()"></div>`',
      '})',
      'export class C {}',
      '',
    ].join('\n');
    const vs = await run(src);
    expect(vs).toHaveLength(0);
  });

  it('does not crash on [style.z-index]="5" (unitless, ambiguous) and skips it', async () => {
    const src = [
      '@Component({',
      '  template: `<div [style.z-index]="5"></div>`',
      '})',
      'export class C {}',
      '',
    ].join('\n');
    expect(async () => run(src)).not.toThrow();
    const vs = await run(src);
    expect(vs).toHaveLength(0);
  });
});
