import { describe, it, expect } from 'vitest';
import { analyze } from './runner.js';
import { noArbitraryFontSize } from './rules/no-arbitrary-font-size.js';
import { noArbitraryRadius } from './rules/no-arbitrary-radius.js';
import type { uisealConfig } from './config/schema.js';

// End-to-end: a file with an off-scale font-size and an off-scale radius,
// verifying both violations carry the right fix.suggested value together.
describe('nearest-token suggestions — font-size and radius end-to-end', () => {
  const config: uisealConfig = {
    tokens: {
      colors: {},
      spacing: [4, 8, 16],
      fontSizes: [12, 14, 16, 20, 24],
      fontFamilies: ['Inter'],
      radii: [0, 4, 8, 999],
    },
    rules: {},
    ignore: [],
  };

  it('attaches the correct nearest-token suggestion to each violation', async () => {
    const css = `
      .card {
        font-size: 21px;
        border-radius: 6px;
      }
    `;
    const { violations } = await analyze({
      files: new Map([['card.css', css]]),
      config,
      rules: [noArbitraryFontSize, noArbitraryRadius],
    });

    const fontSizeViolation = violations.find((v) => v.ruleId === 'no-arbitrary-font-size');
    const radiusViolation = violations.find((v) => v.ruleId === 'no-arbitrary-radius');

    expect(fontSizeViolation).toBeDefined();
    expect(fontSizeViolation!.fix).toEqual({ suggested: '20px' });

    expect(radiusViolation).toBeDefined();
    expect(radiusViolation!.fix).toEqual({ suggested: '4px' });
  });
});
