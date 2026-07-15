// Collects EVERY color/spacing/font-size/radius/font-family value actually
// used in the codebase, with occurrence locations — not just the ones that
// violate a rule (analyze() only reports off-token values) and not just
// frequency counts (extractor/index.ts's extract() has no location
// tracking, and only understands 'css'/'jsx' ParsedFile kinds, not
// 'vue'/'angular'/'svelte').
//
// Design decision: this is a NEW module rather than an extension of
// extractor/index.ts. The classification logic below intentionally mirrors
// extract()'s processDecl/collectColors/collectPxValues exactly (same
// regexes, same isVarToken/matchColorValues calls) so drift's numbers are
// consistent with what `init`'s code-scan source already reports — but
// changing extract()'s own Map<value, count> shape to also carry locations
// would ripple into cli/commands/init.ts, extractor/emit.ts, and
// extractor/cluster.ts for no benefit to init itself. Reuses the existing,
// already-tested per-framework adapters (walkAst/extractInlineStyleDecls
// from runner.ts, the Vue/Angular/Svelte template adapters) rather than
// reimplementing framework dispatch a second time.
import type { Declaration, Root } from 'postcss';
import type { TSESTree } from '@typescript-eslint/types';
import { parse as parseColorLib, formatHex } from 'culori';
import { getParserForFile } from '../parsers/registry.js';
import { isVarToken, matchColorValues, parseValue } from '../values/parse-value.js';
import { walkAst, extractInlineStyleDecls } from '../runner.js';
import { walkVueTemplate, extractVueInlineStyleDecls } from '../vue/template-adapter.js';
import { extractAngularInlineStyleDecls } from '../angular/template-adapter.js';
import { walkSvelteTemplate, extractSvelteInlineStyleDecls } from '../svelte/template-adapter.js';

export interface DriftLocation {
  file: string;
  line: number;
  column: number;
}

export interface CollectedCodeValues {
  colors: Map<string, DriftLocation[]>;
  spacing: Map<number, DriftLocation[]>;
  fontSizes: Map<number, DriftLocation[]>;
  radii: Map<number, DriftLocation[]>;
  fontFamilies: Map<string, DriftLocation[]>;
}

// Same regexes/keyword set as extractor/index.ts's private consts —
// deliberately duplicated (see module doc comment) rather than exported
// from there, to keep this addition zero-risk to the existing extract()/
// init flow.
const COLOR_PROP_RE =
  /^(color|background(-color|-image|-gradient|-attachment|-clip|-origin|-position|-repeat|-size)?|border(-top|-right|-bottom|-left)?(-color)?|fill|stroke|outline(-color|-style|-width|-offset)?)$/;
const SPACING_PROP_RE =
  /^(margin(-top|-right|-bottom|-left)?|padding(-top|-right|-bottom|-left)?|gap|row-gap|column-gap|top|left|right|bottom)$/;
const FONT_FAMILY_KEYWORDS = new Set([
  'inherit', 'initial', 'unset', 'revert', 'normal',
  'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy',
  'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'ui-rounded',
]);

function record<K>(map: Map<K, DriftLocation[]>, key: K, loc: DriftLocation): void {
  const arr = map.get(key);
  if (arr) arr.push(loc);
  else map.set(key, [loc]);
}

export function normalizeHex(raw: string): string | null {
  const parsed = parseColorLib(raw.trim());
  return parsed ? (formatHex(parsed) ?? null) : null;
}

function classifyDecl(
  prop: string,
  value: string,
  file: string,
  line: number,
  column: number,
  out: CollectedCodeValues,
): void {
  const trimmed = value.trim();
  if (isVarToken(trimmed)) return; // var()/$scss/@less reference — already tokenized, not a hardcoded value
  const loc: DriftLocation = { file, line, column };

  if (COLOR_PROP_RE.test(prop)) {
    for (const m of matchColorValues(trimmed)) {
      const hex = normalizeHex(m);
      if (hex) record(out.colors, hex, loc);
    }
  }
  if (SPACING_PROP_RE.test(prop)) {
    for (const part of trimmed.replace(/\//g, ' ').split(/\s+/)) {
      const parsed = parseValue(part);
      if (parsed.unit === 'px' && parsed.value !== null) record(out.spacing, parsed.value, loc);
    }
  }
  if (prop === 'font-size') {
    for (const part of trimmed.split(/\s+/)) {
      const parsed = parseValue(part);
      if (parsed.unit === 'px' && parsed.value !== null) record(out.fontSizes, parsed.value, loc);
    }
  }
  if (prop === 'border-radius') {
    for (const part of trimmed.replace(/\//g, ' ').split(/\s+/)) {
      const parsed = parseValue(part);
      if (parsed.unit === 'px' && parsed.value !== null) record(out.radii, parsed.value, loc);
    }
  }
  if (prop === 'font-family') {
    const first = trimmed.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '');
    if (first && !FONT_FAMILY_KEYWORDS.has(first.toLowerCase())) {
      record(out.fontFamilies, first, loc);
    }
  }
}

function collectFromRoot(root: Root, file: string, offset: number, out: CollectedCodeValues): void {
  root.walkDecls((decl) => {
    classifyDecl(
      decl.prop,
      decl.value,
      file,
      (decl.source?.start?.line ?? 1) + offset,
      decl.source?.start?.column ?? 0,
      out,
    );
  });
}

function collectDeclList(decls: Declaration[], file: string, offset: number, out: CollectedCodeValues): void {
  for (const decl of decls) {
    classifyDecl(
      decl.prop,
      decl.value,
      file,
      (decl.source?.start?.line ?? 1) + offset,
      decl.source?.start?.column ?? 0,
      out,
    );
  }
}

function extractAttrStringValue(attr: TSESTree.JSXAttribute): string | null {
  const v = attr.value;
  if (!v) return null;
  if (v.type === 'Literal' && typeof v.value === 'string') return v.value;
  if (v.type === 'JSXExpressionContainer') {
    const e = v.expression;
    if (e.type === 'Literal' && typeof e.value === 'string') return e.value;
    if (e.type === 'TemplateLiteral' && e.quasis.length === 1) {
      return e.quasis[0]!.value.cooked ?? null;
    }
  }
  return null;
}

function collectFromJsx(ast: TSESTree.Program, file: string, out: CollectedCodeValues): void {
  walkAst(ast, (node) => {
    if (node.type === 'JSXAttribute') {
      const attr = node as TSESTree.JSXAttribute;
      const rawName = attr.name.type === 'JSXIdentifier' ? attr.name.name : null;
      if (rawName && rawName !== 'style') {
        const cssProp = rawName.replace(/([A-Z])/g, '-$1').toLowerCase();
        const value = extractAttrStringValue(attr);
        if (value !== null) {
          classifyDecl(cssProp, value, file, attr.loc?.start.line ?? 1, attr.loc?.start.column ?? 0, out);
        }
      }
    }
    collectDeclList(extractInlineStyleDecls(node), file, 0, out);
  });
}

/**
 * Scans every value-bearing declaration (real CSS, JSX/Vue/Angular/Svelte
 * inline styles) across the given files, regardless of whether it matches
 * any token — this is the "everything actually in the code" side of a
 * drift comparison. Tailwind utility classes are intentionally out of
 * scope here (matching extract()'s own pre-existing scope) — see the
 * drift feature's known limitations.
 */
export function collectCodeValues(files: Map<string, string>): CollectedCodeValues {
  const out: CollectedCodeValues = {
    colors: new Map(),
    spacing: new Map(),
    fontSizes: new Map(),
    radii: new Map(),
    fontFamilies: new Map(),
  };

  for (const [filePath, code] of files) {
    const parser = getParserForFile(filePath);
    if (!parser) continue;

    let parsed;
    try {
      parsed = parser.parse(code, filePath);
    } catch {
      continue; // malformed file — best-effort scan, skip rather than fail the whole report
    }

    if (parsed.kind === 'css') {
      collectFromRoot(parsed.root, filePath, 0, out);
    } else if (parsed.kind === 'jsx') {
      collectFromJsx(parsed.ast, filePath, out);
    } else if (parsed.kind === 'vue') {
      for (const style of parsed.styles) collectFromRoot(style.root, filePath, style.offset, out);
      if (parsed.template) {
        walkVueTemplate(parsed.template.ast, (node) => {
          collectDeclList(extractVueInlineStyleDecls(node), filePath, 0, out);
        });
      }
    } else if (parsed.kind === 'angular') {
      if (!parsed.isComponent) continue;
      for (const style of parsed.styles) collectFromRoot(style.root, filePath, style.offset, out);
      if (parsed.template) {
        collectDeclList(
          extractAngularInlineStyleDecls(parsed.template.content),
          filePath,
          parsed.template.offset,
          out,
        );
      }
    } else if (parsed.kind === 'svelte') {
      for (const style of parsed.styles) collectFromRoot(style.root, filePath, style.offset, out);
      if (parsed.template) {
        walkSvelteTemplate(parsed.template, (node) => {
          collectDeclList(extractSvelteInlineStyleDecls(node), filePath, 0, out);
        });
      }
    }
  }

  return out;
}
