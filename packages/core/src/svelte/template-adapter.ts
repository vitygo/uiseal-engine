// Converts Svelte template markup into either postcss Declaration-like
// objects (style-bearing attributes/directives) or Tailwind class-string
// segments (class-bearing attributes/directives). Simpler than Vue/Angular:
// Svelte has no JS-object-literal style binding (no :style="{}" / [ngStyle])
// — just a static style="..." declaration list and individual style:prop
// directives — so this needs none of the expression-parsing machinery the
// other two adapters use.
import type { Declaration } from 'postcss';
import { makeSyntheticDecl } from '../adapters/object-expr-to-decls.js';

// Svelte's template AST (svelte/compiler) is not TSESTree — its own node
// shapes (Element, Attribute, StyleDirective, Class, ...). Using `any`
// mirrors runner.ts's own walkAst/walkVueTemplate, which treat their
// respective ASTs generically the same way; there's no shared type to
// narrow to.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SvelteNode = any;

/** Recursively visits every node in a Svelte template AST (skips `loc` — position data, not template structure; {#if}/{#each} block bodies are ordinary child properties, found by the same generic traversal). */
export function walkSvelteTemplate(node: SvelteNode, visit: (node: SvelteNode) => void): void {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object') walkSvelteTemplate(item, visit);
      }
    } else if (child && typeof child === 'object' && 'type' in child) {
      walkSvelteTemplate(child, visit);
    }
  }
}

// A static "..." value is a single Text node; braces ({expr}) produce a
// MustacheTag (or more, for interpolated text) instead — anything other
// than exactly one Text node is dynamic and not statically known.
function staticTextValue(value: Array<{ type: string; data?: string }> | undefined): string | null {
  if (!value || value.length !== 1) return null;
  const only = value[0]!;
  return only.type === 'Text' && only.data !== undefined ? only.data : null;
}

/**
 * Extracts CSS Declarations from a single Element node's static
 * style="..." attribute and/or style:prop="value" directives.
 *
 * Each declaration is reported at its own attribute/directive's name_loc —
 * unlike Vue/Angular, Svelte's AST gives every individual binding its own
 * precise position (verified empirically), so no shared-position
 * simplification is needed here.
 */
export function extractSvelteInlineStyleDecls(node: SvelteNode): Declaration[] {
  if (!node || !Array.isArray(node.attributes)) return [];
  const decls: Declaration[] = [];

  for (const attr of node.attributes) {
    const pos = { line: attr.name_loc?.start.line ?? 1, column: attr.name_loc?.start.column ?? 0 };

    if (attr.type === 'Attribute' && attr.name === 'style') {
      const text = staticTextValue(attr.value);
      if (text === null) continue; // style={expr} — dynamic, skip
      for (const part of text.split(';')) {
        const colonIdx = part.indexOf(':');
        if (colonIdx === -1) continue;
        const cssProp = part.slice(0, colonIdx).trim();
        const cssValue = part.slice(colonIdx + 1).trim();
        if (!cssProp || !cssValue) continue;
        decls.push(makeSyntheticDecl(cssProp, cssValue, pos));
      }
    } else if (attr.type === 'StyleDirective') {
      const text = staticTextValue(attr.value);
      if (text === null) continue; // style:prop={expr} — dynamic, skip
      decls.push(makeSyntheticDecl(attr.name, text, pos));
    }
  }

  return decls;
}

export interface SvelteClassSegment {
  text: string;
  line: number;
  column: number;
}

/**
 * Extracts class="..." text and class:name={cond} directive names from a
 * single Element node. class:name is reported as its own segment (just the
 * name — a directive can't hold multiple classes) since the name IS the
 * potentially-arbitrary Tailwind value, checked regardless of the bound
 * condition's value (static analysis, not runtime evaluation) — Svelte's
 * parser already gives the class name directly on the node even when it
 * contains bracket syntax (class:mt-[13px]={cond} parses fine).
 */
export function extractSvelteClassSegments(node: SvelteNode): SvelteClassSegment[] {
  if (!node || !Array.isArray(node.attributes)) return [];
  const segments: SvelteClassSegment[] = [];

  for (const attr of node.attributes) {
    const pos = { line: attr.name_loc?.start.line ?? 1, column: attr.name_loc?.start.column ?? 0 };

    if (attr.type === 'Attribute' && attr.name === 'class') {
      const text = staticTextValue(attr.value);
      if (text === null) continue; // class={expr} — dynamic, skip
      segments.push({ text, ...pos });
    } else if (attr.type === 'Class') {
      segments.push({ text: attr.name, ...pos });
    }
  }

  return segments;
}
