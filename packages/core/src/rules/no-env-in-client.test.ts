import { describe, it, expect } from 'vitest';
import { analyze } from '../runner.js';
import { noEnvInClient } from './no-env-in-client.js';
import type { uisealConfig } from '../config/schema.js';

const baseConfig: uisealConfig = {
  tokens: { colors: {}, spacing: [], fontSizes: [], fontFamilies: [], radii: [] },
  rules: {},
  ignore: [],
};

async function run(filePath: string, code: string) {
  const { violations } = await analyze({ files: new Map([[filePath, code]]), config: baseConfig, rules: [noEnvInClient] });
  return violations;
}

describe('no-env-in-client', () => {
  it('flags process.env.SECRET in a client tsx file', async () => {
    const vs = await run('components/Login.tsx', `const secret = process.env.SECRET;`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.ruleId).toBe('no-env-in-client');
    expect(vs[0]!.severity).toBe('error');
    expect(vs[0]!.message).toContain('SECRET');
  });

  it('flags process.env["DB_PASSWORD"] in a client tsx file', async () => {
    const vs = await run('components/Foo.tsx', `const x = process.env["DB_PASSWORD"];`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.message).toContain('DB_PASSWORD');
  });

  it('does not flag NEXT_PUBLIC_ prefixed env vars', async () => {
    const vs = await run('components/Nav.tsx', `const url = process.env.NEXT_PUBLIC_API_URL;`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag VITE_ prefixed env vars', async () => {
    const vs = await run('components/Nav.tsx', `const url = process.env.VITE_API_URL;`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag files whose path matches /api/', async () => {
    const vs = await run('pages/api/route.tsx', `const secret = process.env.SECRET;`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag files whose path matches .server.', async () => {
    const vs = await run('lib/auth.server.tsx', `const secret = process.env.SECRET;`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag files with a "use server" directive', async () => {
    const vs = await run('actions/submit.tsx', `"use server";\nconst secret = process.env.SECRET;`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag next.config.ts (server file)', async () => {
    const vs = await run('next.config.ts', `const secret = process.env.SECRET;`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag vite.config.ts (server file)', async () => {
    const vs = await run('vite.config.ts', `const secret = process.env.SECRET;`);
    expect(vs).toHaveLength(0);
  });

  it('flags theme.config.client.ts as a client file', async () => {
    const vs = await run('theme.config.client.tsx', `const secret = process.env.SECRET;`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.ruleId).toBe('no-env-in-client');
  });
});
