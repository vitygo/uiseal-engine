import { describe, it, expect } from 'vitest';
import { analyze } from '../runner.js';
import { noConsoleSensitive } from './no-console-sensitive.js';
import type { uisealConfig } from '../config/schema.js';

const baseConfig: uisealConfig = {
  tokens: { colors: {}, spacing: [], fontSizes: [], fontFamilies: [], radii: [] },
  rules: {},
  ignore: [],
};

async function run(code: string) {
  const { violations } = await analyze({ files: new Map([['test.tsx', code]]), config: baseConfig, rules: [noConsoleSensitive] });
  return violations;
}

describe('no-console-sensitive', () => {
  it('flags console.log with a sensitive identifier (token)', async () => {
    const vs = await run(`const token = "abc"; console.log(token);`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.ruleId).toBe('no-console-sensitive');
    expect(vs[0]!.severity).toBe('warning');
    expect(vs[0]!.message).toContain('token');
  });

  it('flags console.log with a member expression containing a sensitive property', async () => {
    const vs = await run(`console.log(user.password);`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.message).toContain('password');
  });

  it('flags console.log with an object containing a sensitive key', async () => {
    const vs = await run(`console.log({ token, username });`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.message).toContain('token');
  });

  it('flags console.log with a template literal referencing a sensitive identifier', async () => {
    const vs = await run('console.log(`key=${apiKey}`);');
    expect(vs).toHaveLength(1);
    expect(vs[0]!.message).toContain('apiKey');
  });

  it('flags console.error with a sensitive argument', async () => {
    const vs = await run(`console.error(authToken);`);
    expect(vs).toHaveLength(1);
  });

  it('does not flag console.log with non-sensitive data', async () => {
    const vs = await run(`console.log("hello world");`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag console.log with a non-sensitive identifier', async () => {
    const vs = await run(`const username = "alice"; console.log(username);`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag console.log with a non-sensitive object', async () => {
    const vs = await run(`console.log({ name: "Alice", age: 30 });`);
    expect(vs).toHaveLength(0);
  });
});
