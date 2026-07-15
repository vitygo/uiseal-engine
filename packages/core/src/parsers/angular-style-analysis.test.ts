import { describe, it, expect } from 'vitest';
import { analyze } from '../runner.js';
import { noHardcodedColor } from '../rules/no-hardcoded-color.js';
import { noArbitrarySpacing } from '../rules/no-arbitrary-spacing.js';
import type { uisealConfig } from '../config/schema.js';

const config: uisealConfig = {
  tokens: {
    colors: {},
    spacing: [4, 8, 16],
    fontSizes: [12, 14, 16],
    fontFamilies: ['Inter'],
    radii: [4, 8],
  },
  rules: {},
  ignore: [],
};

async function run(code: string) {
  const { violations } = await analyze({
    files: new Map([['button.component.ts', code]]),
    config,
    rules: [noHardcodedColor, noArbitrarySpacing],
  });
  return violations;
}

describe('Angular inline styles — CSS rules with correct .component.ts line numbers', () => {
  it('reports no-hardcoded-color and no-arbitrary-spacing at the true file line', async () => {
    const src = [
      "import { Component } from '@angular/core';", // 1
      '', // 2
      '@Component({', // 3
      "  selector: 'app-button',", // 4
      '  styles: [`', // 5
      '    .btn { color: #ff0000; padding: 13px; }', // 6
      '  `],', // 7
      "  template: `<button class=\"btn\">Click</button>`", // 8
      '})', // 9
      'export class ButtonComponent {}', // 10
      '',
    ].join('\n');

    const vs = await run(src);
    const color = vs.find((v) => v.ruleId === 'no-hardcoded-color');
    const spacing = vs.find((v) => v.ruleId === 'no-arbitrary-spacing');

    expect(color).toBeDefined();
    expect(color!.line).toBe(6);
    expect(color!.file).toBe('button.component.ts');

    expect(spacing).toBeDefined();
    expect(spacing!.line).toBe(6);
  });

  it('does not analyze a plain .ts file with no @Component decorator', async () => {
    const { violations } = await analyze({
      files: new Map([['utils.ts', 'export const x = 1;\n']]),
      config,
      rules: [noHardcodedColor, noArbitrarySpacing],
    });
    expect(violations).toHaveLength(0);
  });

  it('skips a .component.ts file that has no @Component decorator (isComponent: false path)', async () => {
    const { violations } = await analyze({
      files: new Map([
        [
          'weird.component.ts',
          "export class NotAComponent { color = '#ff0000'; }\n",
        ],
      ]),
      config,
      rules: [noHardcodedColor, noArbitrarySpacing],
    });
    expect(violations).toHaveLength(0);
  });
});
