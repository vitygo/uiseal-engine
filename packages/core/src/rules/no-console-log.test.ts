import { describe, it, expect } from 'vitest';
import { analyze } from '../runner.js';
import { noConsoleLog } from './no-console-log.js';
import type { uisealConfig } from '../config/schema.js';

const baseConfig: uisealConfig = {
  tokens: { colors: {}, spacing: [], fontSizes: [], fontFamilies: [], radii: [] },
  rules: {},
  ignore: [],
};

async function run(code: string) {
  const { violations } = await analyze({
    files: new Map([['test.tsx', code]]),
    config: baseConfig,
    rules: [noConsoleLog],
  });
  return violations;
}

describe('no-console-log — flag cases', () => {
  it('flags console.log call', async () => {
    const vs = await run(`console.log("hello world");`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.ruleId).toBe('no-console-log');
    expect(vs[0]!.severity).toBe('warning');
    expect(vs[0]!.message).toContain('console.log');
  });

  it('flags console.log with a variable argument', async () => {
    const vs = await run(`const x = 1; console.log(x);`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.ruleId).toBe('no-console-log');
  });

  it('flags console.log with multiple arguments', async () => {
    const vs = await run(`console.log("label", someVar, 42);`);
    expect(vs).toHaveLength(1);
  });
});

describe('no-console-log — safe cases', () => {
  it('does not flag console.warn', async () => {
    const vs = await run(`console.warn("warning");`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag console.error', async () => {
    const vs = await run(`console.error("error");`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag console.info', async () => {
    const vs = await run(`console.info("info");`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag console.debug', async () => {
    const vs = await run(`console.debug("debug");`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag console.log suppressed by eslint-disable-line comment on same line', async () => {
    const vs = await run(`console.log("test"); // eslint-disable-line`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag console.log suppressed by uiseal-ignore on preceding line', async () => {
    const vs = await run(`// uiseal-ignore no-console-log\nconsole.log("test");`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag console.log with eslint-disable block comment on same line', async () => {
    const vs = await run(`console.log("test"); /* eslint-disable */`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag unrelated console calls', async () => {
    const vs = await run(`console.table([1, 2, 3]);`);
    expect(vs).toHaveLength(0);
  });
});
