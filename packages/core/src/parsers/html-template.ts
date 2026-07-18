// Parses HTML-with-embedded-template-syntax files (Laravel Blade, Jinja2,
// Rails ERB, Twig) — a single generalized parser for all four dialects.
// Not a real template-engine parser: the approach (proven by
// angular/template-scanner.ts for Angular's own HTML-with-bindings
// templates) is a lightweight regex tag/attribute scan, not a DOM tree.
// The one extra step here is neutralizing each dialect's template tags
// FIRST — replacing every non-newline character inside a {{ }}/{% %}/<% %>
// span with a single space — so that:
//   1. A stray `<`/`>`/`"` inside a template expression (e.g. Blade's
//      `@if($x > $y)`) can't corrupt tag/attribute matching.
//   2. Template expressions embedded in a class="" string become
//      whitespace, so splitting on whitespace naturally skips them —
//      `class="px-4 {{ $dynamic }} mt-[13px]"` neutralizes to
//      `class="px-4              mt-[13px]"`.
//   3. Line/column numbers stay correct, because the neutralized text is
//      exactly the same length and has exactly the same newlines as the
//      original — only non-newline characters inside a matched span change.

export interface TemplateDialect {
  id: 'blade' | 'jinja2' | 'erb' | 'twig';
  /** Patterns to strip/neutralize; combined into one alternation and applied in a single pass. */
  tagPatterns: RegExp[];
}

export interface TemplateAttribute {
  /** The attribute value with template tags replaced by spaces — safe to feed to CSS/Tailwind checking as-is. */
  value: string;
  /** The original attribute value, template tags intact. */
  rawValue: string;
  /** Position of the attribute's TAG (shared by every attribute on that tag — same precedent as the Angular/Vue template adapters). */
  line: number;
  column: number;
}

export interface HtmlTemplateParsedFile {
  kind: 'html-template';
  dialect: TemplateDialect['id'];
  classAttributes: TemplateAttribute[];
  styleAttributes: TemplateAttribute[];
}

// {{ }} covers plain output AND Blade's `{{-- comment --}}` (still just a
// `{{` ... nearest `}}` span). {!! !!} is raw/unescaped output. The
// directive pattern handles one level of parenthesis nesting
// (`@if($user->hasRole('admin'))`) — deeper nesting fails open (the
// argument list is left un-neutralized), which is safe: at worst a
// directive's raw text leaks into a class/style scan and gets ignored by
// parseValue()/extractArbitraryValues() as unrecognizable, never a false positive.
export const BLADE_DIALECT: TemplateDialect = {
  id: 'blade',
  tagPatterns: [
    /\{\{[\s\S]*?\}\}/,
    /\{!![\s\S]*?!!\}/,
    /@\w+(?:\((?:[^()]|\([^()]*\))*\))?/,
  ],
};

// Twig is a direct descendant of Jinja2's templating syntax — {{ }}, {% %},
// {# #} — so the two dialects share identical strip patterns.
const JINJA_LIKE_PATTERNS: RegExp[] = [/\{\{[\s\S]*?\}\}/, /\{%[\s\S]*?%\}/, /\{#[\s\S]*?#\}/];

export const JINJA2_DIALECT: TemplateDialect = { id: 'jinja2', tagPatterns: JINJA_LIKE_PATTERNS };
export const TWIG_DIALECT: TemplateDialect = { id: 'twig', tagPatterns: JINJA_LIKE_PATTERNS };

// <%= %> (output), <% %> (code), <%# %> (comment) — a single `<% ... %>`
// pattern already matches all three forms (the `=`/`#` are just the first
// character INSIDE the tag), so they're functionally one pattern; kept as
// three for clarity about which ERB forms are covered.
export const ERB_DIALECT: TemplateDialect = {
  id: 'erb',
  tagPatterns: [/<%=[\s\S]*?%>/, /<%#[\s\S]*?%>/, /<%[\s\S]*?%>/],
};

function neutralize(source: string, dialect: TemplateDialect): string {
  const combined = new RegExp(dialect.tagPatterns.map((p) => p.source).join('|'), 'g');
  return source.replace(combined, (match) => match.replace(/[^\n]/g, ' '));
}

interface ScannedAttr {
  name: string;
  value: string;
  /** char offset of the value's first character in the scanned string */
  valueStart: number;
}

interface ScannedTag {
  attrs: ScannedAttr[];
  line: number;
  column: number;
}

// Same TAG_RE/ATTR_RE approach as angular/template-scanner.ts — reimplemented
// rather than imported so this parser can additionally track each value's
// character offset (needed to slice `rawValue` back out of the original,
// un-neutralized source). Same known limitation as the Angular scanner: a
// stray `>` inside an un-neutralized attribute value ends the tag match
// early — safe (fails open, only a missed tag, never a false positive).
const TAG_RE = /<([a-zA-Z][\w-]*)((?:\s+[^<>]*)?)\s*\/?>/g;
const ATTR_RE = /([[(]?[\w.$-]+[\])]?)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function offsetToLineColumn(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lastNewlineIndex = -1;
  for (let i = 0; i < offset; i++) {
    if (text[i] === '\n') {
      line++;
      lastNewlineIndex = i;
    }
  }
  return { line, column: offset - lastNewlineIndex - 1 };
}

function scanHtmlTags(html: string): ScannedTag[] {
  const tags: ScannedTag[] = [];

  TAG_RE.lastIndex = 0;
  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = TAG_RE.exec(html)) !== null) {
    const tagText = tagMatch[0];
    const tagOffset = tagMatch.index;
    const attrs: ScannedAttr[] = [];

    ATTR_RE.lastIndex = 0;
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = ATTR_RE.exec(tagText)) !== null) {
      const name = attrMatch[1]!;
      const value = attrMatch[2] ?? attrMatch[3] ?? '';
      const quoteChar = attrMatch[2] !== undefined ? '"' : "'";
      const valueStartInTag = attrMatch.index + attrMatch[0].indexOf(quoteChar) + 1;
      attrs.push({ name, value, valueStart: tagOffset + valueStartInTag });
    }

    if (attrs.length === 0) continue;
    const pos = offsetToLineColumn(html, tagOffset);
    tags.push({ attrs, line: pos.line, column: pos.column });
  }

  return tags;
}

export function parseHtmlTemplate(source: string, dialect: TemplateDialect): HtmlTemplateParsedFile {
  const neutralized = neutralize(source, dialect);

  const classAttributes: TemplateAttribute[] = [];
  const styleAttributes: TemplateAttribute[] = [];

  for (const tag of scanHtmlTags(neutralized)) {
    for (const attr of tag.attrs) {
      if (attr.name !== 'class' && attr.name !== 'style') continue;
      const templateAttr: TemplateAttribute = {
        value: attr.value,
        rawValue: source.slice(attr.valueStart, attr.valueStart + attr.value.length),
        line: tag.line,
        column: tag.column,
      };
      if (attr.name === 'class') classAttributes.push(templateAttr);
      else styleAttributes.push(templateAttr);
    }
  }

  return { kind: 'html-template', dialect: dialect.id, classAttributes, styleAttributes };
}
