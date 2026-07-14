import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from './runner.js';
import { noHardcodedColor } from './rules/no-hardcoded-color.js';
import { noArbitrarySpacing } from './rules/no-arbitrary-spacing.js';
import type { uisealConfig } from './config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(__dirname, '__fixtures__/scss-less-fixture');

const config: uisealConfig = {
  tokens: {
    colors: {},
    spacing: [4, 8, 16, 24],
    fontSizes: [14, 16, 18],
    fontFamilies: ['Inter'],
    radii: [4, 8],
  },
  rules: {},
  ignore: [],
};

async function analyzeFixture(fileName: string) {
  const full = path.join(fixtureDir, fileName);
  const files = new Map([[full, fs.readFileSync(full, 'utf8')]]);
  return analyze({ files, config, rules: [noHardcodedColor, noArbitrarySpacing] });
}

describe.each(['styles.scss', 'styles.less'])('SCSS/LESS end-to-end — %s', (fileName) => {
  it('flags the hardcoded hex in the variable definition (line 1)', async () => {
    const { violations } = await analyzeFixture(fileName);
    const colorViolations = violations.filter((v) => v.ruleId === 'no-hardcoded-color');
    expect(colorViolations.some((v) => v.line === 1 && v.message.includes('#ff0000'))).toBe(true);
  });

  it('does not flag the color variable usage (color: $primary / @primary)', async () => {
    const { violations } = await analyzeFixture(fileName);
    const colorViolations = violations.filter((v) => v.ruleId === 'no-hardcoded-color');
    // line 8 is `color: <var>;` in both fixtures — only line 1 (the definition) should fire.
    expect(colorViolations.some((v) => v.line === 8)).toBe(false);
  });

  it('flags the nested background hex and 13px spacing inside &:hover', async () => {
    const { violations } = await analyzeFixture(fileName);
    expect(violations.some((v) => v.ruleId === 'no-hardcoded-color' && v.message.includes('#00ff00'))).toBe(true);
    expect(violations.some((v) => v.ruleId === 'no-arbitrary-spacing' && v.message.includes('13px'))).toBe(true);
  });

  it('does not flag the spacing variable usage or the valid 8px token', async () => {
    const { violations } = await analyzeFixture(fileName);
    const spacingViolations = violations.filter((v) => v.ruleId === 'no-arbitrary-spacing');
    expect(spacingViolations.every((v) => v.message.includes('13px'))).toBe(true);
  });

  it('parses the mixin/include without a parse-error', async () => {
    const { violations } = await analyzeFixture(fileName);
    expect(violations.some((v) => v.ruleId === 'parse-error')).toBe(false);
  });
});
