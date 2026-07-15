import { describe, it, expect } from 'vitest';
import { parseVue } from './vue.js';
import { getParserForFile, buildGlob } from './registry.js';

describe('parseVue — style blocks', () => {
  it('extracts a plain <style> block as a postcss Root', () => {
    const src = [
      '<template><div/></template>',
      '<style>',
      '.btn { color: #ff0000; }',
      '</style>',
      '',
    ].join('\n');

    const parsed = parseVue(src, 'test.vue');
    expect(parsed.kind).toBe('vue');
    expect(parsed.styles).toHaveLength(1);
    expect(parsed.styles[0]!.lang).toBe('css');
    const decls: string[] = [];
    parsed.styles[0]!.root.walkDecls((d) => decls.push(d.prop));
    expect(decls).toEqual(['color']);
  });

  it('parses <style lang="scss"> with postcss-scss (nesting, $vars)', () => {
    const src = [
      '<template><div/></template>',
      '<style lang="scss">',
      '.card {',
      '  $bg: #1a1a2e;',
      '  background: $bg;',
      '  .inner { margin: 7px; }',
      '}',
      '</style>',
      '',
    ].join('\n');

    const parsed = parseVue(src, 'test.vue');
    expect(parsed.styles[0]!.lang).toBe('scss');
    const props: string[] = [];
    parsed.styles[0]!.root.walkDecls((d) => props.push(d.prop));
    expect(props).toEqual(['$bg', 'background', 'margin']);
  });

  it('parses <style lang="less">', () => {
    const src = [
      '<template><div/></template>',
      '<style lang="less">',
      '.card { @bg: #1a1a2e; background: @bg; }',
      '</style>',
      '',
    ].join('\n');

    const parsed = parseVue(src, 'test.vue');
    expect(parsed.styles[0]!.lang).toBe('less');
    const props: string[] = [];
    parsed.styles[0]!.root.walkDecls((d) => props.push(d.prop));
    expect(props).toContain('background');
  });

  it('extracts multiple <style> blocks', () => {
    const src = [
      '<template><div/></template>',
      '<style>.a { color: red; }</style>',
      '<style lang="scss" scoped>.b { color: blue; }</style>',
      '',
    ].join('\n');

    const parsed = parseVue(src, 'test.vue');
    expect(parsed.styles).toHaveLength(2);
    expect(parsed.styles[1]!.lang).toBe('scss');
  });

  it('computes the correct line offset for a style block', () => {
    const src = ['<template><div/></template>', '<style>', '.btn { color: #ff0000; }', '</style>', ''].join(
      '\n',
    );
    // <style> tag is on line 2.
    const parsed = parseVue(src, 'test.vue');
    expect(parsed.styles[0]!.offset).toBe(1);
  });

  it('handles a .vue file with no <style> block', () => {
    const src = '<template><div/></template>\n';
    const parsed = parseVue(src, 'test.vue');
    expect(parsed.styles).toEqual([]);
  });
});

describe('parseVue — template', () => {
  it('extracts the template AST', () => {
    const src = '<template><div class="px-4" /></template>\n';
    const parsed = parseVue(src, 'test.vue');
    expect(parsed.template).not.toBeNull();
    expect(parsed.template!.offset).toBe(0);
  });

  it('handles a .vue file with no <template> block', () => {
    const src = '<script>export default {}</script>\n';
    const parsed = parseVue(src, 'test.vue');
    expect(parsed.template).toBeNull();
  });
});

describe('registry — .vue registration', () => {
  it('resolves the vue parser for a .vue file', () => {
    expect(getParserForFile('Card.vue')?.id).toBe('vue');
  });

  it('includes .vue in buildGlob()', () => {
    expect(buildGlob()).toContain('vue');
  });
});
