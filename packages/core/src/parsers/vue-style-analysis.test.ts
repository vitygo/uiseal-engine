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
    files: new Map([['Card.vue', code]]),
    config,
    rules: [noHardcodedColor, noArbitrarySpacing],
  });
  return violations;
}

describe('Vue <style> — plain CSS violations with correct .vue file line numbers', () => {
  it('reports no-hardcoded-color and no-arbitrary-spacing at the true file line', async () => {
    const src = [
      '<template><div class="btn" /></template>', // line 1
      '<style>', // line 2
      '.btn { color: #ff0000; padding: 13px; }', // line 3
      '</style>', // line 4
      '',
    ].join('\n');

    const vs = await run(src);
    const color = vs.find((v) => v.ruleId === 'no-hardcoded-color');
    const spacing = vs.find((v) => v.ruleId === 'no-arbitrary-spacing');

    expect(color).toBeDefined();
    expect(color!.line).toBe(3);
    expect(color!.file).toBe('Card.vue');

    expect(spacing).toBeDefined();
    expect(spacing!.line).toBe(3);
  });

  it('reports correct lines for a <style> block that starts further down the file', async () => {
    const src = [
      '<template>', // 1
      '  <div class="btn">Hello</div>', // 2
      '</template>', // 3
      '<script setup>', // 4
      'const x = 1;', // 5
      '</script>', // 6
      '<style>', // 7
      '.btn {', // 8
      '  color: #ff0000;', // 9
      '}', // 10
      '</style>', // 11
      '',
    ].join('\n');

    const vs = await run(src);
    const color = vs.find((v) => v.ruleId === 'no-hardcoded-color');
    expect(color!.line).toBe(9);
  });
});

describe('Vue <style lang="scss"> — nesting and $vars', () => {
  it('resolves nested selectors and flags a hardcoded color assigned via a $var', async () => {
    const src = [
      '<template><div class="card" /></template>', // 1
      '<style lang="scss">', // 2
      '.card {', // 3
      '  $bg: #1a1a2e;', // 4
      '  background: $bg;', // 5
      '  padding: 13px;', // 6
      '  .inner { margin: 7px; }', // 7
      '}', // 8
      '</style>', // 9
      '',
    ].join('\n');

    const vs = await run(src);
    const color = vs.find((v) => v.ruleId === 'no-hardcoded-color');
    const spacingViolations = vs.filter((v) => v.ruleId === 'no-arbitrary-spacing');

    // $bg: #1a1a2e; is itself a hardcoded-color-bearing variable definition.
    expect(color).toBeDefined();
    expect(color!.line).toBe(4);

    // padding: 13px (line 6) and the nested .inner { margin: 7px } (line 7).
    expect(spacingViolations.map((v) => v.line).sort()).toEqual([6, 7]);
  });
});
