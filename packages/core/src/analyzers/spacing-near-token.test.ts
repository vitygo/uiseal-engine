import { describe, it, expect } from 'vitest';
import { analyze } from '../runner.js';
import { noArbitrarySpacing } from '../rules/no-arbitrary-spacing.js';
import type { uisealConfig } from '../config/schema.js';

// Scale with 5+ values to enable the checker
const baseConfig: uisealConfig = {
  tokens: {
    colors: {},
    spacing: [4, 8, 16, 24, 32],
    fontSizes: [14, 16],
    fontFamilies: ['Inter'],
    radii: [4],
  },
  rules: {},
  ignore: [],
};

async function run(css: string, cfg = baseConfig) {
  const { violations } = await analyze({ files: new Map([['test.css', css]]), config: cfg, rules: [] });
  return violations;
}

describe('spacing-near-token analyzer', () => {
  it('flags 18px when scale has 16px and 20px nearby (spec test 9)', async () => {
    const config: uisealConfig = {
      ...baseConfig,
      tokens: { ...baseConfig.tokens, spacing: [4, 8, 16, 20, 32] },
    };
    const vs = await run('.a { padding: 18px; }', config);
    const v = vs.find((x) => x.ruleId === 'spacing-near-token');
    expect(v).toBeDefined();
    expect(v!.message).toContain('18px');
    expect(v!.message).toContain('2px');
    expect(v!.message).toContain('16px');
    expect(v!.severity).toBe('warning');
  });

  it('does not flag 24px when 24px is exactly in the scale (spec test 10)', async () => {
    const vs = await run('.a { padding: 24px; }');
    expect(vs.filter((x) => x.ruleId === 'spacing-near-token')).toHaveLength(0);
  });

  it('flags 50px when nearest is 48px (diff=2px) (spec test 11)', async () => {
    const config: uisealConfig = {
      ...baseConfig,
      tokens: { ...baseConfig.tokens, spacing: [4, 8, 16, 32, 48] },
    };
    const vs = await run('.a { padding: 50px; }', config);
    const v = vs.find((x) => x.ruleId === 'spacing-near-token');
    expect(v).toBeDefined();
    expect(v!.message).toContain('50px');
    expect(v!.message).toContain('48px');
  });

  it('does not flag 100px when nearest is 48px (diff=52px, too far) (spec test 12)', async () => {
    const config: uisealConfig = {
      ...baseConfig,
      tokens: { ...baseConfig.tokens, spacing: [4, 8, 16, 32, 48] },
    };
    const vs = await run('.a { padding: 100px; }', config);
    expect(vs.filter((x) => x.ruleId === 'spacing-near-token')).toHaveLength(0);
  });

  it('does not flag anything when spacing scale has fewer than 5 values (spec test 13)', async () => {
    const config: uisealConfig = {
      ...baseConfig,
      tokens: { ...baseConfig.tokens, spacing: [8, 16, 24] },
    };
    const vs = await run('.a { padding: 18px; }', config);
    expect(vs.filter((x) => x.ruleId === 'spacing-near-token')).toHaveLength(0);
  });

  it('flags values exactly 4px away (at threshold boundary)', async () => {
    const vs = await run('.a { padding: 20px; }');
    const v = vs.find((x) => x.ruleId === 'spacing-near-token');
    expect(v).toBeDefined();
    expect(v!.message).toContain('20px');
    expect(v!.message).toContain('4px');
  });

  it('does not flag values 5px away (beyond threshold)', async () => {
    // 37px is 5px from nearest token 32px — just outside the <=4px threshold
    const vs = await run('.a { padding: 37px; }');
    expect(vs.filter((x) => x.ruleId === 'spacing-near-token')).toHaveLength(0);
  });

  it('suppresses no-arbitrary-spacing for a near-miss value', async () => {
    const { violations: vs } = await analyze({
      files: new Map([['test.css', '.a { padding: 18px; }']]),
      config: baseConfig,
      rules: [noArbitrarySpacing],
    });
    expect(vs.filter((x) => x.ruleId === 'spacing-near-token')).toHaveLength(1);
    expect(vs.filter((x) => x.ruleId === 'no-arbitrary-spacing')).toHaveLength(0);
  });

  it('keeps no-arbitrary-spacing for non-near-miss values', async () => {
    // 100px is far from all tokens in baseConfig scale, no near-token refinement
    const { violations: vs } = await analyze({
      files: new Map([['test.css', '.a { padding: 100px; }']]),
      config: baseConfig,
      rules: [noArbitrarySpacing],
    });
    expect(vs.filter((x) => x.ruleId === 'no-arbitrary-spacing')).toHaveLength(1);
    expect(vs.filter((x) => x.ruleId === 'spacing-near-token')).toHaveLength(0);
  });

  it('handles multi-value shorthand: near-miss part suppresses only its own no-arbitrary-spacing', async () => {
    // 18px (near-miss) and 100px (far miss) in same declaration
    const { violations: vs } = await analyze({
      files: new Map([['test.css', '.a { padding: 18px 100px; }']]),
      config: baseConfig,
      rules: [noArbitrarySpacing],
    });
    // spacing-near-token fires for 18px
    expect(vs.filter((x) => x.ruleId === 'spacing-near-token')).toHaveLength(1);
    // no-arbitrary-spacing remains for 100px but is suppressed for 18px
    const arb = vs.filter((x) => x.ruleId === 'no-arbitrary-spacing');
    expect(arb).toHaveLength(1);
    expect(arb[0]!.message).toContain('100px');
  });

  it('skips the rule when configured as off', async () => {
    const config: uisealConfig = { ...baseConfig, rules: { 'spacing-near-token': 'off' } };
    const vs = await run('.a { padding: 18px; }', config);
    expect(vs.filter((x) => x.ruleId === 'spacing-near-token')).toHaveLength(0);
  });

  it('converts rem values correctly (1.125rem = 18px → near 16px)', async () => {
    const vs = await run('.a { padding: 1.125rem; }');
    const v = vs.find((x) => x.ruleId === 'spacing-near-token');
    expect(v).toBeDefined();
    expect(v!.message).toContain('18px');
  });
});
