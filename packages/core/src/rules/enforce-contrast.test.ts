import { describe, it, expect } from 'vitest';
import { analyze } from '../runner.js';
import { enforceContrast } from './enforce-contrast.js';
import type { uisealConfig } from '../config/schema.js';

const baseConfig: uisealConfig = {
  tokens: {
    colors: {},
    spacing: [4, 8, 16],
    fontSizes: [14, 16],
    fontFamilies: ['Inter'],
    radii: [4],
  },
  rules: {},
  ignore: [],
  wcag: { level: 'AA' }, // threshold 4.5:1
};

async function run(code: string, config: uisealConfig = baseConfig) {
  const { violations } = await analyze({
    files: new Map([['test.css', code]]),
    config,
    rules: [enforceContrast],
  });
  return violations;
}

describe('enforce-contrast', () => {
  // Light gray (#aaaaaa) on white (#ffffff): contrast ≈ 2.32:1 — fails AA.
  it('flags a color/background pair below AA threshold', async () => {
    const vs = await run('.a { color: #aaaaaa; background-color: #ffffff; }');
    expect(vs).toHaveLength(1);
    expect(vs[0]!.ruleId).toBe('enforce-contrast');
    expect(vs[0]!.message).toContain('AA');
    expect(vs[0]!.message).toContain('same-block');
  });

  // Black (#000000) on white (#ffffff): contrast = 21:1 — passes both AA and AAA.
  it('passes for a high-contrast pair', async () => {
    const vs = await run('.a { color: #000000; background-color: #ffffff; }');
    expect(vs).toHaveLength(0);
  });

  it('does not flag when there is no background sibling', async () => {
    const vs = await run('.a { color: #aaaaaa; }');
    expect(vs).toHaveLength(0);
  });

  it('does not flag when background uses a CSS variable', async () => {
    const vs = await run('.a { color: #aaaaaa; background-color: var(--bg); }');
    expect(vs).toHaveLength(0);
  });

  it('does not flag when color uses a CSS variable', async () => {
    const vs = await run('.a { color: var(--fg); background-color: #aaaaaa; }');
    expect(vs).toHaveLength(0);
  });

  it('accepts background shorthand as the background value', async () => {
    const vs = await run('.a { color: #aaaaaa; background: #ffffff; }');
    expect(vs).toHaveLength(1);
  });

  // Dark gray (#555555) on white: contrast ≈ 7.46:1 — passes AA but not the AAA test below.
  // Actually let me use #767676 on white which is exactly 4.54:1 (just above AA).
  it('passes pairs that are exactly above the AA threshold', async () => {
    // #767676 on white ≈ 4.54:1 — should pass AA.
    const vs = await run('.a { color: #767676; background-color: #ffffff; }');
    expect(vs).toHaveLength(0);
  });

  it('flags below AAA threshold when configured', async () => {
    // Dark gray #555555 on white ≈ 7.46:1 — passes AAA. Use lighter gray.
    // #767676 on white ≈ 4.54:1 — fails AAA (7:1).
    const aaaConfig: uisealConfig = { ...baseConfig, wcag: { level: 'AAA' } };
    const vs = await run('.a { color: #767676; background-color: #ffffff; }', aaaConfig);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.message).toContain('AAA');
  });

  it('does not report on background-color declaration (only on color)', async () => {
    // Only one violation per block (attached to the color declaration).
    const vs = await run('.a { color: #aaaaaa; background-color: #ffffff; }');
    expect(vs).toHaveLength(1);
    expect(vs[0]!.message).toContain('#aaaaaa');
  });

  it('checks pairs in separate rule blocks independently', async () => {
    const css = `
.ok { color: #000000; background-color: #ffffff; }
.bad { color: #aaaaaa; background-color: #ffffff; }
`;
    const vs = await run(css);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.message).toContain('#aaaaaa');
  });
});
