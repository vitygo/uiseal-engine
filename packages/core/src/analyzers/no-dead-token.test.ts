import { describe, it, expect } from 'vitest';
import { analyze } from '../runner.js';
import type { uisealConfig } from '../config/schema.js';

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

async function run(files: Map<string, string>) {
  const { violations } = await analyze({ files, config: baseConfig, rules: [] });
  return violations;
}

describe('no-dead-token analyzer', () => {
  it('flags a token defined in :root that is never used', async () => {
    const css = `:root { --color-brand: #ff0000; }\n.a { color: red; }`;
    const vs = await run(new Map([['tokens.css', css]]));
    const v = vs.find((x) => x.ruleId === 'no-dead-token');
    expect(v).toBeDefined();
    expect(v!.message).toContain('--color-brand');
    expect(v!.file).toBe('tokens.css');
    expect(v!.severity).toBe('warning');
  });

  it('does not flag a token that is used via var() in the same file', async () => {
    const css = `:root { --color-brand: #ff0000; }\n.a { color: var(--color-brand); }`;
    const vs = await run(new Map([['tokens.css', css]]));
    expect(vs.filter((x) => x.ruleId === 'no-dead-token')).toHaveLength(0);
  });

  it('does not flag a token used in a different file (cross-file used set)', async () => {
    const tokensCss = `:root { --color-brand: #ff0000; }`;
    const componentCss = `.a { color: var(--color-brand); }`;
    const vs = await run(new Map([['tokens.css', tokensCss], ['component.css', componentCss]]));
    expect(vs.filter((x) => x.ruleId === 'no-dead-token')).toHaveLength(0);
  });

  it('does not flag --tw-* tokens (Tailwind internals)', async () => {
    const css = `:root { --tw-ring-color: #000; }\n.a { color: red; }`;
    const vs = await run(new Map([['tokens.css', css]]));
    expect(vs.filter((x) => x.ruleId === 'no-dead-token')).toHaveLength(0);
  });

  it('does not flag --vp-* tokens (VitePress internals)', async () => {
    const css = `:root { --vp-c-brand: #ff0000; }`;
    const vs = await run(new Map([['tokens.css', css]]));
    expect(vs.filter((x) => x.ruleId === 'no-dead-token')).toHaveLength(0);
  });

  it('does not flag --_ prefixed tokens (private convention)', async () => {
    const css = `:root { --_internal: 8px; }`;
    const vs = await run(new Map([['tokens.css', css]]));
    expect(vs.filter((x) => x.ruleId === 'no-dead-token')).toHaveLength(0);
  });

  it('detects token usage inside JSX inline style var() strings', async () => {
    const tokensCss = `:root { --space-4: 16px; }`;
    const jsx = `export function A() { return <div style={{ padding: 'var(--space-4)' }} />; }`;
    const vs = await run(new Map([['tokens.css', tokensCss], ['A.tsx', jsx]]));
    expect(vs.filter((x) => x.ruleId === 'no-dead-token')).toHaveLength(0);
  });

  it('reports the correct line number for the :root declaration', async () => {
    const css = `/* header */\n:root {\n  --color-x: red;\n}\n.a { color: blue; }`;
    const vs = await run(new Map([['styles.css', css]]));
    const v = vs.find((x) => x.ruleId === 'no-dead-token');
    expect(v).toBeDefined();
    expect(v!.line).toBe(3);
  });

  it('skips the rule when configured as off', async () => {
    const css = `:root { --unused: red; }`;
    const config: uisealConfig = { ...baseConfig, rules: { 'no-dead-token': 'off' } };
    const { violations: vs } = await analyze({ files: new Map([['t.css', css]]), config, rules: [] });
    expect(vs.filter((x) => x.ruleId === 'no-dead-token')).toHaveLength(0);
  });

  it('upgrades severity to error when configured', async () => {
    const css = `:root { --unused: red; }`;
    const config: uisealConfig = { ...baseConfig, rules: { 'no-dead-token': 'error' } };
    const { violations: vs } = await analyze({ files: new Map([['t.css', css]]), config, rules: [] });
    const v = vs.find((x) => x.ruleId === 'no-dead-token');
    expect(v).toBeDefined();
    expect(v!.severity).toBe('error');
  });

  it('does not flag declarations outside :root', async () => {
    const css = `.a { --color-brand: red; }\n.b { color: blue; }`;
    const vs = await run(new Map([['t.css', css]]));
    expect(vs.filter((x) => x.ruleId === 'no-dead-token')).toHaveLength(0);
  });

  it('flags multiple unused tokens', async () => {
    const css = `:root { --a: 1px; --b: 2px; }`;
    const vs = await run(new Map([['t.css', css]]));
    const dead = vs.filter((x) => x.ruleId === 'no-dead-token');
    expect(dead).toHaveLength(2);
    expect(dead.map((v) => v.message)).toEqual(
      expect.arrayContaining([expect.stringContaining('--a'), expect.stringContaining('--b')]),
    );
  });
});
