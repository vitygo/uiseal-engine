import { describe, it, expect } from 'vitest';
import { parseHtmlTemplate, BLADE_DIALECT, JINJA2_DIALECT, TWIG_DIALECT, ERB_DIALECT } from './html-template.js';

describe('parseHtmlTemplate — tag stripping', () => {
  it('strips {{ $var }} to spaces of equal length, preserving position', () => {
    const rawValue = '{{ $var }} px-4';
    const src = `<div class="${rawValue}">x</div>`;
    const result = parseHtmlTemplate(src, BLADE_DIALECT);
    expect(result.classAttributes[0]!.value).toBe(' '.repeat('{{ $var }}'.length) + ' px-4');
    expect(result.classAttributes[0]!.value.length).toBe(rawValue.length);
    expect(result.classAttributes[0]!.rawValue).toBe(rawValue);
  });

  it('strips @if(...) directives, including one level of nested parens', () => {
    const src = `<div>\n@if($user->hasRole('admin'))\n  <span class="px-4">x</span>\n@endif\n</div>`;
    const result = parseHtmlTemplate(src, BLADE_DIALECT);
    // The <span> is on line 3 — directive stripping must not have eaten the
    // newlines around it or shifted subsequent line numbers.
    expect(result.classAttributes[0]!.line).toBe(3);
  });

  it('strips {!! $html !!} (Blade raw output)', () => {
    const src = `<div class="px-4 {!! $raw !!} mt-[13px]">x</div>`;
    const result = parseHtmlTemplate(src, BLADE_DIALECT);
    expect(result.classAttributes[0]!.value).toContain('px-4');
    expect(result.classAttributes[0]!.value).toContain('mt-[13px]');
    expect(result.classAttributes[0]!.value).not.toContain('$raw');
  });

  it('strips <%= expr %> (ERB output)', () => {
    const src = `<div class="px-4 <%= dynamic %> mt-[13px]">x</div>`;
    const result = parseHtmlTemplate(src, ERB_DIALECT);
    expect(result.classAttributes[0]!.value).toBe('px-4 ' + ' '.repeat('<%= dynamic %>'.length) + ' mt-[13px]');
  });

  it('strips <% code %> and <%# comment %> (ERB)', () => {
    const src = `<% if show %>\n<p class="px-4"><%# a comment %></p>\n<% end %>`;
    const result = parseHtmlTemplate(src, ERB_DIALECT);
    expect(result.classAttributes[0]!.line).toBe(2);
  });

  it('strips {% if %}/{% endif %} and {# comment #} (Jinja2)', () => {
    const src = `{# a comment #}\n{% if show %}\n<span class="px-4">x</span>\n{% endif %}`;
    const result = parseHtmlTemplate(src, JINJA2_DIALECT);
    expect(result.classAttributes[0]!.line).toBe(3);
  });

  it('Twig shares Jinja2 patterns exactly ({{ }}, {% %}, {# #})', () => {
    const src = `<div class="{{ dynamic_class }} text-[15px]">x</div>`;
    const result = parseHtmlTemplate(src, TWIG_DIALECT);
    expect(result.classAttributes[0]!.value.trim()).toBe('text-[15px]');
  });
});

describe('parseHtmlTemplate — position preservation', () => {
  it('reports correct line/column for a tag several lines into the file', () => {
    const src = `<div>\n  <p>\n    text\n  </p>\n  <span class="mt-[13px]">x</span>\n</div>`;
    const result = parseHtmlTemplate(src, JINJA2_DIALECT);
    expect(result.classAttributes[0]!.line).toBe(5);
  });

  it('preserves line numbers across a multi-line template tag', () => {
    const src = `<div class="{{\n  some_long_expression\n}} px-4">\n  <span class="mt-[13px]">x</span>\n</div>`;
    const result = parseHtmlTemplate(src, JINJA2_DIALECT);
    // The multi-line {{ }} spans lines 1-3; the <span> after it must still
    // be correctly reported on line 4, not shifted by the stripped span.
    expect(result.classAttributes[1]!.line).toBe(4);
  });
});

describe('parseHtmlTemplate — edge cases', () => {
  it('a template tag inside a style value neutralizes to spaces, not a crash', () => {
    const src = `<div style="color: {{ $color }}; padding: 13px">x</div>`;
    const result = parseHtmlTemplate(src, JINJA2_DIALECT);
    expect(result.styleAttributes[0]!.value).toContain('padding: 13px');
    expect(result.styleAttributes[0]!.value).not.toContain('$color');
  });

  it('handles an empty class attribute without crashing', () => {
    const src = `<div class="">x</div>`;
    const result = parseHtmlTemplate(src, JINJA2_DIALECT);
    expect(result.classAttributes).toHaveLength(1);
    expect(result.classAttributes[0]!.value).toBe('');
  });

  it('a nested/adjacent template tag {{ fn({{ inner }}) }} fails open without crashing', () => {
    const src = `<div class="{{ fn({{ inner }}) }} px-4">x</div>`;
    expect(() => parseHtmlTemplate(src, JINJA2_DIALECT)).not.toThrow();
  });

  it('an unquoted attribute (class=px-4) is safely skipped, not misread', () => {
    const src = `<div class=px-4>x</div>`;
    const result = parseHtmlTemplate(src, JINJA2_DIALECT);
    expect(result.classAttributes).toHaveLength(0);
  });

  it('a file with no class/style attributes returns empty arrays', () => {
    const src = `<div>{{ name }}</div>`;
    const result = parseHtmlTemplate(src, JINJA2_DIALECT);
    expect(result.classAttributes).toEqual([]);
    expect(result.styleAttributes).toEqual([]);
  });
});
