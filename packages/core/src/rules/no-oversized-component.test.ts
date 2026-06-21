import { describe, it, expect } from 'vitest';
import { analyze } from '../runner.js';
import { noOversizedComponent } from './no-oversized-component.js';
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
    rules: [noOversizedComponent],
  });
  return violations;
}

function makeLines(n: number): string {
  return Array.from({ length: n }, () => '  const _x = 1;').join('\n');
}

function makeFnDecl(name: string, bodyLines: number): string {
  return `function ${name}() {\n${makeLines(bodyLines)}\n}`;
}

function makeArrow(name: string, bodyLines: number): string {
  return `const ${name} = () => {\n${makeLines(bodyLines)}\n};`;
}

function makeFnExpr(name: string, bodyLines: number): string {
  return `const ${name} = function() {\n${makeLines(bodyLines)}\n};`;
}

describe('no-oversized-component — flag cases', () => {
  it('flags a function declaration component with 302-line body', async () => {
    const vs = await run(makeFnDecl('MyComponent', 302));
    expect(vs).toHaveLength(1);
    expect(vs[0]!.ruleId).toBe('no-oversized-component');
    expect(vs[0]!.message).toContain('MyComponent');
    expect(vs[0]!.message).toMatch(/\d{3,} lines/);
    expect(vs[0]!.severity).toBe('warning');
  });

  it('flags an arrow function component with 302-line body', async () => {
    const vs = await run(makeArrow('BigWidget', 302));
    expect(vs).toHaveLength(1);
    expect(vs[0]!.message).toContain('BigWidget');
  });

  it('flags a function expression component with 302-line body', async () => {
    const vs = await run(makeFnExpr('HugeForm', 302));
    expect(vs).toHaveLength(1);
    expect(vs[0]!.message).toContain('HugeForm');
  });
});

describe('no-oversized-component — safe cases', () => {
  it('does not flag a component with exactly 300 lines', async () => {
    // 300 lines of body → end - start + 1 = 300 + 2 (braces) = 302 total but body span = 300
    // body from line 1 to line 302: 302 - 1 + 1 = 302. This exceeds 300.
    // Use 298 body lines to stay under: 1 + 298 + 1 = 300 total lines → exactly 300, not flagged.
    const vs = await run(makeFnDecl('JustFine', 298));
    expect(vs).toHaveLength(0);
  });

  it('does not flag a small component', async () => {
    const vs = await run(`function MyComp() { return <div>hi</div>; }`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag a lowercase function (not a React component)', async () => {
    const vs = await run(makeFnDecl('utilHelper', 302));
    expect(vs).toHaveLength(0);
  });

  it('does not flag a lowercase arrow variable', async () => {
    const vs = await run(makeArrow('myHelper', 302));
    expect(vs).toHaveLength(0);
  });

  it('does not flag arrow component without a block body', async () => {
    const vs = await run(`const Comp = () => <div>short</div>;`);
    expect(vs).toHaveLength(0);
  });
});
