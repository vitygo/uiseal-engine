import { describe, it, expect } from 'vitest';
import { analyze } from './runner.js';
import { fingerprintViolations } from './baseline/fingerprint.js';
import { noHardcodedColor } from './rules/no-hardcoded-color.js';
import { noArbitrarySpacing } from './rules/no-arbitrary-spacing.js';
import { noConsoleLog } from './rules/no-console-log.js';
import type { uisealConfig } from './config/schema.js';

const baseConfig: uisealConfig = {
  tokens: {
    colors: { '--primary': '#1a73e8' },
    spacing: [8, 16],
    fontSizes: [],
    fontFamilies: [],
    radii: [],
  },
  rules: {},
  ignore: [],
};

async function runCss(code: string) {
  const { violations } = await analyze({
    files: new Map([['test.css', code]]),
    config: baseConfig,
    rules: [noHardcodedColor, noArbitrarySpacing],
  });
  return violations;
}

async function runTsx(code: string) {
  const { violations } = await analyze({
    files: new Map([['test.tsx', code]]),
    config: baseConfig,
    rules: [noConsoleLog, noHardcodedColor, noArbitrarySpacing],
  });
  return violations;
}

// Test 6 — CSS: next line suppressed, not two lines down
describe('uiseal-ignore — CSS inline comments', () => {
  it('suppresses violation on the immediately following line', async () => {
    const code = [
      '/* uiseal-ignore no-hardcoded-color */',
      '.hero { color: #000000; }',
    ].join('\n');
    expect(await runCss(code)).toHaveLength(0);
  });

  it('does NOT suppress a violation two lines down', async () => {
    const code = [
      '/* uiseal-ignore no-hardcoded-color */',
      '.safe { margin: 5px; }',
      '.hero { color: #000000; }',
    ].join('\n');
    const vs = await runCss(code);
    // .hero violation on line 3 is not suppressed; .safe spacing violation on line 2 may also fire
    expect(vs.some((v) => v.ruleId === 'no-hardcoded-color' && v.line === 3)).toBe(true);
  });

  it('with reason comment still suppresses', async () => {
    const code = [
      '/* uiseal-ignore no-hardcoded-color -- brand black, intentional */',
      '.hero { background: #000000; }',
    ].join('\n');
    expect(await runCss(code)).toHaveLength(0);
  });
});

// Test 7 — JSX/TS single-line comment suppresses next line
describe('uiseal-ignore — JSX/TS single-line comments', () => {
  it('suppresses violation on the next line with //', async () => {
    const code = [
      '// uiseal-ignore no-console-log',
      'console.log("test");',
    ].join('\n');
    expect(await runTsx(code)).toHaveLength(0);
  });

  it('suppresses violation on the next line with /* */ block', async () => {
    const code = [
      '/* uiseal-ignore no-console-log -- third-party embed */',
      'console.log("test");',
    ].join('\n');
    expect(await runTsx(code)).toHaveLength(0);
  });

  it('does NOT suppress a violation two lines down', async () => {
    const code = [
      '// uiseal-ignore no-console-log',
      'const x = 1;',
      'console.log("test");',
    ].join('\n');
    const vs = await runTsx(code);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.ruleId).toBe('no-console-log');
    expect(vs[0]!.line).toBe(3);
  });
});

// Test 8 — Multiple comma-separated rules suppressed, other rules not
describe('uiseal-ignore — multiple rule IDs', () => {
  it('suppresses all listed rules on next line', async () => {
    const code = [
      '/* uiseal-ignore no-hardcoded-color, no-arbitrary-spacing */',
      '.hero { color: #000000; margin: 5px; }',
    ].join('\n');
    expect(await runCss(code)).toHaveLength(0);
  });

  it('suppresses only the listed rules, not other rules', async () => {
    const code = [
      '/* uiseal-ignore no-hardcoded-color */',
      '.hero { color: #000000; margin: 5px; }',
    ].join('\n');
    const vs = await runCss(code);
    // no-hardcoded-color is suppressed; no-arbitrary-spacing for "5px" is NOT
    expect(vs.every((v) => v.ruleId !== 'no-hardcoded-color')).toBe(true);
    expect(vs.some((v) => v.ruleId === 'no-arbitrary-spacing')).toBe(true);
  });
});

// Test 9 — Bare uiseal-ignore (no ruleId) suppresses all rules
describe('uiseal-ignore — bare (no rule ID) suppresses all', () => {
  it('bare CSS comment suppresses all rules on next line', async () => {
    const code = [
      '/* uiseal-ignore */',
      '.hero { color: #000000; margin: 5px; }',
    ].join('\n');
    expect(await runCss(code)).toHaveLength(0);
  });

  it('bare TSX comment suppresses all rules on next line', async () => {
    const code = [
      '// uiseal-ignore',
      'console.log("test");',
    ].join('\n');
    expect(await runTsx(code)).toHaveLength(0);
  });
});

// Test 10 — Same-line violation is NOT suppressed
describe('uiseal-ignore — same-line violation NOT suppressed', () => {
  it('CSS: violation on the same line as the comment is not suppressed', async () => {
    const code = '.hero { color: #000000; } /* uiseal-ignore no-hardcoded-color */';
    const vs = await runCss(code);
    expect(vs.some((v) => v.ruleId === 'no-hardcoded-color')).toBe(true);
  });

  it('TSX: violation on the same line as the comment is not suppressed', async () => {
    const code = 'console.log("test"); // uiseal-ignore no-console-log';
    const vs = await runTsx(code);
    expect(vs.some((v) => v.ruleId === 'no-console-log')).toBe(true);
  });
});

// Test 11 — Suppressed violations absent from baseline fingerprints
describe('uiseal-ignore — suppressed violations absent from baseline', () => {
  it('fingerprint list excludes suppressed violations', async () => {
    const code = [
      '// uiseal-ignore no-console-log',
      'console.log("suppressed");',
      'console.log("visible");',
    ].join('\n');
    const violations = await runTsx(code);
    // Only the third-line console.log is visible
    expect(violations).toHaveLength(1);
    expect(violations[0]!.line).toBe(3);

    const fingerprinted = fingerprintViolations(violations, '/project');
    expect(fingerprinted).toHaveLength(1);
    // Ensure there's no fingerprint for the suppressed line-2 violation
    expect(fingerprinted.every((f) => f.line !== 2)).toBe(true);
  });
});
