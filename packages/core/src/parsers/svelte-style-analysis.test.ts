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
    files: new Map([['Card.svelte', code]]),
    config,
    rules: [noHardcodedColor, noArbitrarySpacing],
  });
  return violations;
}

describe('Svelte <style> — plain CSS violations with correct .svelte file line numbers', () => {
  it('reports no-hardcoded-color and no-arbitrary-spacing at the true file line', async () => {
    const src = [
      '<style>', // 1
      '  .btn { color: #ff0000; padding: 13px; }', // 2
      '</style>', // 3
      '', // 4
      '<button class="btn">Click</button>', // 5
      '',
    ].join('\n');

    const vs = await run(src);
    const color = vs.find((v) => v.ruleId === 'no-hardcoded-color');
    const spacing = vs.find((v) => v.ruleId === 'no-arbitrary-spacing');

    expect(color).toBeDefined();
    expect(color!.line).toBe(2);
    expect(color!.file).toBe('Card.svelte');

    expect(spacing).toBeDefined();
    expect(spacing!.line).toBe(2);
  });
});

describe('Svelte <style lang="scss"> — nesting and $vars', () => {
  it('resolves nested selectors and flags a hardcoded color assigned via a $var', async () => {
    const src = [
      '<style lang="scss">', // 1
      '  .card {', // 2
      '    $bg: #1a1a2e;', // 3
      '    background: $bg;', // 4
      '    .inner { padding: 7px; }', // 5
      '  }', // 6
      '</style>', // 7
      '', // 8
      '<div class="card"><div class="inner">Hi</div></div>', // 9
      '',
    ].join('\n');

    const vs = await run(src);
    const color = vs.find((v) => v.ruleId === 'no-hardcoded-color');
    const spacing = vs.find((v) => v.ruleId === 'no-arbitrary-spacing');

    expect(color).toBeDefined();
    expect(color!.line).toBe(3);
    expect(spacing).toBeDefined();
    expect(spacing!.line).toBe(5);
  });
});
