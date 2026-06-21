import { describe, it, expect } from 'vitest';
import { analyze } from '../runner.js';
import { noHardcodedCredentials } from './no-hardcoded-credentials.js';
import type { uisealConfig } from '../config/schema.js';

const baseConfig: uisealConfig = {
  tokens: { colors: {}, spacing: [], fontSizes: [], fontFamilies: [], radii: [] },
  rules: {},
  ignore: [],
};

async function run(code: string) {
  const { violations } = await analyze({ files: new Map([['test.tsx', code]]), config: baseConfig, rules: [noHardcodedCredentials] });
  return violations;
}

describe('no-hardcoded-credentials', () => {
  it('flags a variable with a known-prefix secret (sk-)', async () => {
    const vs = await run(`const apiKey = "sk-abc123def456ghi789";`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.ruleId).toBe('no-hardcoded-credentials');
    expect(vs[0]!.severity).toBe('error');
    expect(vs[0]!.message).toContain('apiKey');
  });

  it('flags a variable with a GitHub token prefix (ghp_)', async () => {
    const vs = await run(`const token = "ghp_abc123def456ghi789jkl0";`);
    expect(vs).toHaveLength(1);
  });

  it('flags a high-entropy string (>=20 chars, mixed case + digits) in a secret field', async () => {
    const vs = await run(`const secret = "aBcDeFgH1234567890XY";`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.message).toContain('secret');
  });

  it('flags a hardcoded password object property', async () => {
    const vs = await run(`const cfg = { password: "sk-realSecret123ABCXYZ" };`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.message).toContain('password');
  });

  it('does not flag an empty string', async () => {
    const vs = await run(`const apiKey = "";`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag an obvious placeholder ("your-api-key")', async () => {
    const vs = await run(`const apiKey = "your-api-key-here";`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag "changeme" placeholder', async () => {
    const vs = await run(`const password = "changeme";`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag process.env reference (not a string literal)', async () => {
    const vs = await run(`const apiKey = process.env.API_KEY;`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag a short low-entropy string that lacks a known prefix', async () => {
    const vs = await run(`const token = "abc123";`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag unrelated variable names even with secret-looking values', async () => {
    const vs = await run(`const greeting = "sk-hello123WorldABCXYZ";`);
    expect(vs).toHaveLength(0);
  });
});
