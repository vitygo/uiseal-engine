import { describe, it, expect } from 'vitest';
import { analyze } from '../runner.js';
import { noInlineStyles } from './no-inline-styles.js';
import type { uisealConfig } from '../config/schema.js';

const baseConfig: uisealConfig = {
  tokens: { colors: {}, spacing: [], fontSizes: [], fontFamilies: [], radii: [] },
  rules: {},
  ignore: [],
};

async function run(code: string) {
  const { violations } = await analyze({ files: new Map([['test.tsx', code]]), config: baseConfig, rules: [noInlineStyles] });
  return violations;
}

describe('no-inline-styles', () => {
  it('flags object literal style prop and lists the properties', async () => {
    const vs = await run(`export function A() { return <div style={{ color: 'red' }} />; }`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.ruleId).toBe('no-inline-styles');
    expect(vs[0]!.severity).toBe('warning');
    expect(vs[0]!.message).toContain('color');
  });

  it('flags multiple properties and lists all of them', async () => {
    const vs = await run(`export function A() { return <div style={{ padding: '16px', margin: 8 }} />; }`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.message).toContain('padding');
    expect(vs[0]!.message).toContain('margin');
  });

  it('flags a custom component with an inline style object', async () => {
    const vs = await run(`export function A() { return <Component style={{ fontFamily: 'Arial' }} />; }`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.message).toContain('fontFamily');
  });

  it('does not flag a variable reference: style={myStyle}', async () => {
    const vs = await run(`export function A() { return <div style={myStyle} />; }`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag a member expression: style={styles.container}', async () => {
    const vs = await run(`export function A() { return <div style={styles.container} />; }`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag a function call: style={getStyle()}', async () => {
    const vs = await run(`export function A() { return <div style={getStyle()} />; }`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag a ternary between two variables', async () => {
    const vs = await run(`export function A() { return <div style={isActive ? styles.active : styles.base} />; }`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag an empty object: style={{}}', async () => {
    const vs = await run(`export function A() { return <div style={{}} />; }`);
    expect(vs).toHaveLength(0);
  });

  it('suppresses the violation when uiseal-ignore no-inline-styles is above the element', async () => {
    const code = `export function A() {
  return (
    // uiseal-ignore no-inline-styles
    <div style={{ color: 'red' }} />
  );
}`;
    expect(await run(code)).toHaveLength(0);
  });
});
