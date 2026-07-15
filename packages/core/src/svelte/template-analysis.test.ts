import { describe, it, expect } from 'vitest';
import { analyze } from '../runner.js';
import { noHardcodedColor } from '../rules/no-hardcoded-color.js';
import { noArbitrarySpacing } from '../rules/no-arbitrary-spacing.js';
import { noTailwindArbitrary } from '../rules/no-tailwind-arbitrary.js';
import type { uisealConfig } from '../config/schema.js';

const config: uisealConfig = {
  tokens: {
    colors: { primary: '#3b82f6' },
    spacing: [4, 8, 12, 16, 24],
    fontSizes: [12, 14, 16, 18, 24],
    fontFamilies: ['Inter'],
    radii: [4, 8, 12],
  },
  rules: {},
  ignore: [],
};

const rules = [noHardcodedColor, noArbitrarySpacing, noTailwindArbitrary];

async function run(code: string) {
  const { violations } = await analyze({
    files: new Map([['Card.svelte', code]]),
    config,
    rules,
  });
  return violations;
}

describe('Svelte template — static style= and style: directives', () => {
  it('flags a spacing value in a static style attribute', async () => {
    const vs = await run('<p style="margin: 7px">Hello</p>\n');
    expect(vs.some((v) => v.ruleId === 'no-arbitrary-spacing' && v.message.includes('7px'))).toBe(true);
  });

  it('flags a hardcoded color from a style:color directive', async () => {
    const vs = await run('<p style:color="#ff0000">Hello</p>\n');
    const color = vs.find((v) => v.ruleId === 'no-hardcoded-color');
    expect(color).toBeDefined();
    expect(color!.message).toContain('#ff0000');
  });

  it('flags a spacing value from a style:padding directive', async () => {
    const vs = await run('<p style:padding="13px">Hello</p>\n');
    expect(vs.some((v) => v.ruleId === 'no-arbitrary-spacing' && v.message.includes('13px'))).toBe(true);
  });

  it('does not flag a style:color bound to a var() token reference', async () => {
    const vs = await run('<p style:color="var(--primary)">Hello</p>\n');
    expect(vs).toHaveLength(0);
  });

  it('does not crash on a dynamic style:color={expr} and finds nothing in it', async () => {
    const vs = await run('<script>let c = "#ff0000";</script>\n<p style:color={c}>Hello</p>\n');
    expect(vs).toHaveLength(0);
  });

  it('does not crash on a dynamic style={expr} and finds nothing in it', async () => {
    const vs = await run('<script>let s = "color: red";</script>\n<p style={s}>Hello</p>\n');
    expect(vs).toHaveLength(0);
  });
});

describe('Svelte template — class= and class: directives (Tailwind)', () => {
  it('flags an arbitrary Tailwind class in a static class attribute', async () => {
    const vs = await run('<div class="px-4 mt-[13px]">Hi</div>\n');
    const flagged = vs.filter((v) => v.ruleId === 'no-tailwind-arbitrary').map((v) => v.oldValue);
    expect(flagged).toContain('mt-[13px]');
    expect(flagged).not.toContain('px-4');
  });

  it('flags an arbitrary Tailwind class used as a class: directive name', async () => {
    const vs = await run('<script>let isActive = true;</script>\n<div class:mt-[13px]={isActive}>Hi</div>\n');
    const flagged = vs.filter((v) => v.ruleId === 'no-tailwind-arbitrary').map((v) => v.oldValue);
    expect(flagged).toContain('mt-[13px]');
  });

  it('does not flag a standard class: directive name (not Tailwind arbitrary)', async () => {
    const vs = await run('<script>let isActive = true;</script>\n<div class:active={isActive}>Hi</div>\n');
    expect(vs.filter((v) => v.ruleId === 'no-tailwind-arbitrary')).toHaveLength(0);
  });
});

describe('Svelte template — content inside {#if}/{#each} is scanned', () => {
  it('flags a Tailwind arbitrary class inside a {#if} block', async () => {
    const vs = await run(
      '<script>let count = 1;</script>\n<div>{#if count > 0}<span class="text-[11px]">Count: {count}</span>{/if}</div>\n',
    );
    const flagged = vs.filter((v) => v.ruleId === 'no-tailwind-arbitrary').map((v) => v.oldValue);
    expect(flagged).toContain('text-[11px]');
  });

  it('flags a Tailwind arbitrary class inside a {#each} block', async () => {
    const vs = await run(
      '<script>let items = [1,2];</script>\n<ul>{#each items as item}<li class="mt-[9px]">{item}</li>{/each}</ul>\n',
    );
    const flagged = vs.filter((v) => v.ruleId === 'no-tailwind-arbitrary').map((v) => v.oldValue);
    expect(flagged).toContain('mt-[9px]');
  });
});

describe('Svelte template — never analyzes <script> content', () => {
  it('does not flag a hardcoded color that only appears in <script>', async () => {
    const vs = await run("<script>\n  const BRAND = '#ff0000';\n</script>\n<div>Hi</div>\n");
    expect(vs).toHaveLength(0);
  });
});
