import { describe, it, expect } from 'vitest';
import { scanAngularTags } from './template-scanner.js';

describe('scanAngularTags', () => {
  it('extracts static and bracket-bound attributes from a tag', () => {
    const html = '<button class="btn px-4" [ngStyle]="{ color: \'red\' }" style="margin: 7px">Click</button>';
    const [tag] = scanAngularTags(html);
    expect(tag).toBeDefined();
    expect(tag!.attrs.get('class')).toBe('btn px-4');
    expect(tag!.attrs.get('[ngStyle]')).toBe("{ color: 'red' }");
    expect(tag!.attrs.get('style')).toBe('margin: 7px');
  });

  it('extracts [style.prop.unit] bindings', () => {
    const html = '<div [style.padding.px]="13"></div>';
    const [tag] = scanAngularTags(html);
    expect(tag!.attrs.get('[style.padding.px]')).toBe('13');
  });

  it('does not match closing tags', () => {
    const html = '<div></div>';
    expect(scanAngularTags(html)).toEqual([]);
  });

  it('handles a tag whose attributes span multiple lines', () => {
    const html = [
      '<button',
      '  class="px-4"',
      '  [ngStyle]="{ color: \'red\' }"',
      '>Click</button>',
    ].join('\n');
    const [tag] = scanAngularTags(html);
    expect(tag!.attrs.get('class')).toBe('px-4');
    expect(tag!.attrs.get('[ngStyle]')).toBe("{ color: 'red' }");
  });

  it('reports the correct line for a tag past several lines', () => {
    const html = ['<div>', '  <p>Hello</p>', '  <span class="mt-[13px]">World</span>', '</div>'].join('\n');
    const tags = scanAngularTags(html);
    const spanTag = tags.find((t) => t.attrs.has('class'));
    expect(spanTag!.line).toBe(3);
  });

  it('skips tags with no attributes', () => {
    const html = '<div><p>text</p></div>';
    expect(scanAngularTags(html)).toEqual([]);
  });
});
