import { describe, it, expect } from 'vitest';
import { analyze } from '../runner.js';
import { noHardcodedColor } from '../rules/no-hardcoded-color.js';
import { noArbitrarySpacing } from '../rules/no-arbitrary-spacing.js';
import { noArbitraryFontSize } from '../rules/no-arbitrary-font-size.js';
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
    files: new Map([['Card.vue', code]]),
    config,
    rules: [noHardcodedColor, noArbitrarySpacing, noArbitraryFontSize],
  });
  return violations;
}

describe('Vue template — :style object binding', () => {
  it('flags an off-scale spacing value and a hardcoded color in a :style object', async () => {
    const src = [
      '<template>', // 1
      '  <div :style="{ padding: \'13px\', color: \'#ff0000\' }">', // 2
      '    <p style="margin: 7px; font-size: 15px">Hello</p>', // 3
      '  </div>', // 4
      '</template>', // 5
      '',
    ].join('\n');

    const vs = await run(src);

    const spacing = vs.filter((v) => v.ruleId === 'no-arbitrary-spacing');
    const color = vs.filter((v) => v.ruleId === 'no-hardcoded-color');
    const fontSize = vs.filter((v) => v.ruleId === 'no-arbitrary-font-size');

    // :style padding: 13px (line 2) + static style margin: 7px (line 3)
    expect(spacing.map((v) => v.line).sort()).toEqual([2, 3]);
    // :style color: #ff0000 (line 2)
    expect(color).toHaveLength(1);
    expect(color[0]!.line).toBe(2);
    // static style font-size: 15px (line 3)
    expect(fontSize).toHaveLength(1);
    expect(fontSize[0]!.line).toBe(3);

    for (const v of [...spacing, ...color, ...fontSize]) {
      expect(v.file).toBe('Card.vue');
    }
  });

  it('does not crash on a dynamic (computed) :style binding and finds nothing in it', async () => {
    const src = '<template><div :style="computedStyle">Hi</div></template>\n';
    const vs = await run(src);
    expect(vs).toHaveLength(0);
  });
});
