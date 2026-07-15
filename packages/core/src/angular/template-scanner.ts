// Lightweight tag/attribute scanner for Angular templates — not a full HTML
// parser (Angular templates are HTML-with-bindings, not JSX or a Vue-style
// compiler AST with its own package), just enough structure to read
// attribute name/value pairs off each opening tag. A regex-based scanner is
// a deliberate scoping choice (see the feature's task description): Angular
// templates don't need a real DOM tree for this — style/class-bearing
// attributes are flat name="value" pairs regardless of nesting depth.
//
// Known limitation: a `>` character inside an attribute value (e.g.
// `[ngIf]="a > b"`) prematurely ends the tag match. Rare in practice for
// style/class-bearing attributes specifically, and failing open (skipping
// that tag) is safe — never a false positive, only a missed one.

export interface AngularTag {
  attrs: Map<string, string>;
  line: number;
  column: number;
}

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

/** Scans every opening tag in an Angular template, returning its attributes and position (the tag's own start — shared by every attribute found on it, same precedent as the Vue template adapter). */
export function scanAngularTags(html: string): AngularTag[] {
  const tags: AngularTag[] = [];

  TAG_RE.lastIndex = 0;
  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = TAG_RE.exec(html)) !== null) {
    const attrs = new Map<string, string>();

    ATTR_RE.lastIndex = 0;
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = ATTR_RE.exec(tagMatch[0])) !== null) {
      const name = attrMatch[1]!;
      const value = attrMatch[2] ?? attrMatch[3] ?? '';
      attrs.set(name, value);
    }

    if (attrs.size === 0) continue;
    const pos = offsetToLineColumn(html, tagMatch.index);
    tags.push({ attrs, line: pos.line, column: pos.column });
  }

  return tags;
}
