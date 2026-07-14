import { describe, it, expect } from 'vitest';
import { getParserForFile, supportedExtensions, buildGlob } from './registry.js';

describe('registry — getParserForFile', () => {
  it('resolves .scss to a css-kind parser', () => {
    const parser = getParserForFile('styles.scss');
    expect(parser).toBeDefined();
    const parsed = parser!.parse('.a { color: red; }', 'styles.scss');
    expect(parsed.kind).toBe('css');
  });

  it('resolves .less to a css-kind parser', () => {
    const parser = getParserForFile('styles.less');
    expect(parser).toBeDefined();
    const parsed = parser!.parse('.a { color: red; }', 'styles.less');
    expect(parsed.kind).toBe('css');
  });

  it('resolves .module.scss and .module.less (CSS Modules) the same as their base extension', () => {
    expect(getParserForFile('Button.module.scss')?.id).toBe('scss');
    expect(getParserForFile('Button.module.less')?.id).toBe('less');
  });

  it('does not resolve .sass (indented syntax is not supported)', () => {
    expect(getParserForFile('styles.sass')).toBeUndefined();
  });

  it('still resolves plain .css and .tsx unchanged', () => {
    expect(getParserForFile('styles.css')?.id).toBe('css');
    expect(getParserForFile('Button.tsx')?.id).toBe('jsx');
  });
});

describe('registry — supportedExtensions / buildGlob', () => {
  it('includes scss and less in supported extensions', () => {
    const exts = supportedExtensions();
    expect(exts).toContain('scss');
    expect(exts).toContain('less');
  });

  it('buildGlob includes scss/less patterns', () => {
    const glob = buildGlob();
    expect(glob).toContain('scss');
    expect(glob).toContain('less');
    expect(glob).toContain('module.scss');
    expect(glob).toContain('module.less');
  });
});
