import { describe, it, expect } from 'vitest';
import { analyze } from '../runner.js';
import { noXssDangerous } from './no-xss-dangerous.js';
import type { uisealConfig } from '../config/schema.js';

const baseConfig: uisealConfig = {
  tokens: { colors: {}, spacing: [], fontSizes: [], fontFamilies: [], radii: [] },
  rules: {},
  ignore: [],
};

async function run(code: string) {
  const { violations } = await analyze({ files: new Map([['test.tsx', code]]), config: baseConfig, rules: [noXssDangerous] });
  return violations;
}

describe('no-xss-dangerous', () => {
  it('flags dangerouslySetInnerHTML with a raw variable', async () => {
    const vs = await run(`export function A() { return <div dangerouslySetInnerHTML={{ __html: content }} />; }`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.ruleId).toBe('no-xss-dangerous');
    expect(vs[0]!.severity).toBe('error');
  });

  it('flags dangerouslySetInnerHTML with a string literal', async () => {
    const vs = await run(`export function A() { return <div dangerouslySetInnerHTML={{ __html: '<b>hi</b>' }} />; }`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.ruleId).toBe('no-xss-dangerous');
  });

  it('flags dangerouslySetInnerHTML with a template literal', async () => {
    const vs = await run('export function A() { return <div dangerouslySetInnerHTML={{ __html: `<b>${raw}</b>` }} />; }');
    expect(vs).toHaveLength(1);
  });

  it('does not flag when __html uses DOMPurify.sanitize()', async () => {
    const vs = await run(`export function A() { return <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(raw) }} />; }`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag when __html uses sanitizeHtml()', async () => {
    const vs = await run(`export function A() { return <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(raw) }} />; }`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag when __html uses a custom clean() call', async () => {
    const vs = await run(`export function A() { return <div dangerouslySetInnerHTML={{ __html: myLib.clean(raw) }} />; }`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag JSX elements without dangerouslySetInnerHTML', async () => {
    const vs = await run(`export function A() { return <div className="foo" />; }`);
    expect(vs).toHaveLength(0);
  });
});
