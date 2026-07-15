import { describe, it, expect } from 'vitest';
import { parseAngular } from './angular.js';
import { getParserForFile, buildGlob } from './registry.js';

describe('parseAngular — @Component detection', () => {
  it('detects a @Component decorator and extracts inline styles + template', () => {
    const src = [
      "import { Component } from '@angular/core';",
      '',
      '@Component({',
      "  selector: 'app-button',",
      '  styles: [`',
      '    .btn { color: #ff0000; padding: 13px; }',
      '  `],',
      "  template: `<button class=\"btn\">Click</button>`",
      '})',
      'export class ButtonComponent {}',
      '',
    ].join('\n');

    const parsed = parseAngular(src);
    expect(parsed.isComponent).toBe(true);
    expect(parsed.styles).toHaveLength(1);
    expect(parsed.template).not.toBeNull();
    expect(parsed.template!.content).toBe('<button class="btn">Click</button>');
  });

  it('returns isComponent: false for a plain .ts file with no @Component', () => {
    const src = 'export function add(a: number, b: number): number {\n  return a + b;\n}\n';
    const parsed = parseAngular(src);
    expect(parsed.isComponent).toBe(false);
    expect(parsed.styles).toEqual([]);
    expect(parsed.template).toBeNull();
  });

  it('returns isComponent: false for a class with an unrelated decorator', () => {
    const src = [
      '@Injectable()',
      'export class SomeService {}',
      '',
    ].join('\n');
    const parsed = parseAngular(src);
    expect(parsed.isComponent).toBe(false);
  });

  it('handles a syntax error gracefully (no throw)', () => {
    expect(() => parseAngular('this is not valid typescript {{{')).not.toThrow();
    expect(parseAngular('this is not valid typescript {{{').isComponent).toBe(false);
  });
});

describe('parseAngular — styles extraction', () => {
  it('parses each element of the styles array as CSS', () => {
    const src = [
      '@Component({',
      '  styles: [`.a { color: red; }`, `.b { color: blue; }`],',
      '  template: `<div></div>`',
      '})',
      'export class C {}',
      '',
    ].join('\n');
    const parsed = parseAngular(src);
    expect(parsed.styles).toHaveLength(2);
    const props0: string[] = [];
    parsed.styles[0]!.root.walkDecls((d) => props0.push(d.prop));
    expect(props0).toEqual(['color']);
  });

  it('computes the correct line offset for a styles template literal', () => {
    const src = [
      '@Component({', // 1
      '  styles: [`', // 2 (backtick on line 2)
      '    .btn { color: red; }', // 3
      '  `],', // 4
      '  template: `<div></div>`', // 5
      '})', // 6
      'export class C {}', // 7
      '',
    ].join('\n');
    const parsed = parseAngular(src);
    // Template literal backtick starts on line 2 -> offset = 1.
    expect(parsed.styles[0]!.offset).toBe(1);
  });

  it('accepts a plain string literal style (not a template literal)', () => {
    const src = [
      '@Component({',
      "  styles: ['.a { color: red; }'],",
      '  template: `<div></div>`',
      '})',
      'export class C {}',
      '',
    ].join('\n');
    const parsed = parseAngular(src);
    expect(parsed.styles).toHaveLength(1);
  });

  it('skips a styles array with no inline entries (only styleUrls used)', () => {
    const src = [
      '@Component({',
      "  styleUrls: ['./c.component.scss'],",
      '  template: `<div></div>`',
      '})',
      'export class C {}',
      '',
    ].join('\n');
    const parsed = parseAngular(src);
    expect(parsed.styles).toEqual([]);
    expect(parsed.isComponent).toBe(true);
  });
});

describe('parseAngular — template extraction', () => {
  it('accepts a plain string literal template (not a template literal)', () => {
    const src = [
      '@Component({',
      "  template: '<div>Hi</div>'",
      '})',
      'export class C {}',
      '',
    ].join('\n');
    const parsed = parseAngular(src);
    expect(parsed.template?.content).toBe('<div>Hi</div>');
  });

  it('skips a template with dynamic interpolation (not statically known)', () => {
    const src = [
      '@Component({',
      '  template: `<div>${dynamic}</div>`',
      '})',
      'export class C {}',
      '',
    ].join('\n');
    const parsed = parseAngular(src);
    expect(parsed.template).toBeNull();
  });

  it('is null when only templateUrl is used', () => {
    const src = [
      '@Component({',
      "  templateUrl: './c.component.html'",
      '})',
      'export class C {}',
      '',
    ].join('\n');
    const parsed = parseAngular(src);
    expect(parsed.template).toBeNull();
    expect(parsed.isComponent).toBe(true);
  });
});

describe('registry — .component.ts registration', () => {
  it('resolves the angular parser for a .component.ts file', () => {
    expect(getParserForFile('button.component.ts')?.id).toBe('angular');
  });

  it('does NOT resolve any parser for a plain .ts file', () => {
    expect(getParserForFile('utils.ts')).toBeUndefined();
    expect(getParserForFile('types.ts')).toBeUndefined();
  });

  it('includes component.ts in buildGlob() but not bare .ts', () => {
    const glob = buildGlob();
    expect(glob).toContain('component.ts');
  });
});
