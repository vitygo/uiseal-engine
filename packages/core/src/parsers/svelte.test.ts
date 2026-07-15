import { describe, it, expect } from 'vitest';
import { parseSvelte } from './svelte.js';
import { getParserForFile, buildGlob } from './registry.js';

describe('parseSvelte — style block', () => {
  it('extracts a plain <style> block as a postcss Root', () => {
    const src = ['<style>', '  .btn { color: #ff0000; }', '</style>', '<div>Hi</div>', ''].join('\n');
    const parsed = parseSvelte(src);
    expect(parsed.kind).toBe('svelte');
    expect(parsed.styles).toHaveLength(1);
    expect(parsed.styles[0]!.lang).toBe('css');
    const props: string[] = [];
    parsed.styles[0]!.root.walkDecls((d) => props.push(d.prop));
    expect(props).toEqual(['color']);
  });

  it('parses <style lang="scss"> with postcss-scss (nesting, $vars)', () => {
    const src = [
      '<style lang="scss">',
      '  .card {',
      '    $bg: #1a1a2e;',
      '    background: $bg;',
      '    .inner { padding: 7px; }',
      '  }',
      '</style>',
      '<div>Hi</div>',
      '',
    ].join('\n');
    const parsed = parseSvelte(src);
    expect(parsed.styles[0]!.lang).toBe('scss');
    const props: string[] = [];
    parsed.styles[0]!.root.walkDecls((d) => props.push(d.prop));
    expect(props).toEqual(['$bg', 'background', 'padding']);
  });

  it('parses <style lang="less">', () => {
    const src = ['<style lang="less">', '  .card { @bg: #1a1a2e; background: @bg; }', '</style>', ''].join('\n');
    const parsed = parseSvelte(src);
    expect(parsed.styles[0]!.lang).toBe('less');
    const props: string[] = [];
    parsed.styles[0]!.root.walkDecls((d) => props.push(d.prop));
    expect(props).toContain('background');
  });

  it('computes the correct line offset for the style block', () => {
    const src = [
      '<style>', // line 1
      '  .btn { color: #ff0000; }', // line 2
      '</style>', // line 3
      '',
    ].join('\n');
    const parsed = parseSvelte(src);
    // <style> tag on line 1 -> offset = 0.
    expect(parsed.styles[0]!.offset).toBe(0);
  });

  it('computes the correct offset when <style> starts further down the file', () => {
    const src = [
      '<script>', // 1
      '  let x = 1;', // 2
      '</script>', // 3
      '', // 4
      '<style>', // 5
      '  .btn { color: #ff0000; }', // 6
      '</style>', // 7
      '',
    ].join('\n');
    const parsed = parseSvelte(src);
    expect(parsed.styles[0]!.offset).toBe(4);
  });

  it('handles a .svelte file with no <style> block', () => {
    const src = '<div>Hi</div>\n';
    const parsed = parseSvelte(src);
    expect(parsed.styles).toEqual([]);
  });
});

describe('parseSvelte — template', () => {
  it('extracts the html AST', () => {
    const src = '<div class="px-4">Hi</div>\n';
    const parsed = parseSvelte(src);
    expect(parsed.template).not.toBeNull();
  });
});

describe('registry — .svelte registration', () => {
  it('resolves the svelte parser for a .svelte file', () => {
    expect(getParserForFile('Card.svelte')?.id).toBe('svelte');
  });

  it('includes .svelte in buildGlob()', () => {
    expect(buildGlob()).toContain('svelte');
  });
});
