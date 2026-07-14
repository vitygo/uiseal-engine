import { parse as parseColor, formatHex } from 'culori';
import type { TSESTree } from '@typescript-eslint/types';
import { parseCss } from '../parsers/css.js';
import { parseJsx } from '../parsers/jsx.js';
import { isVarToken, matchColorValues, parseValue } from '../values/parse-value.js';

export interface ExtractedTokens {
  colors: Map<string, number>;
  spacing: Map<number, number>;
  fontSizes: Map<number, number>;
  fontFamilies: Map<string, number>;
  radii: Map<number, number>;
  /** normalized-hex → CSS variable name (e.g. '#7c3aed' → '--c-violet') from :root blocks */
  cssVars: Map<string, string>;
}

const FONT_FAMILY_KEYWORDS = new Set([
  'inherit', 'initial', 'unset', 'revert', 'normal',
  'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy',
  'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'ui-rounded',
]);

const COLOR_PROP_RE =
  /^(color|background(-color|-image|-gradient|-attachment|-clip|-origin|-position|-repeat|-size)?|border(-top|-right|-bottom|-left)?(-color)?|fill|stroke|outline(-color|-style|-width|-offset)?)$/;

const SPACING_PROP_RE =
  /^(margin(-top|-right|-bottom|-left)?|padding(-top|-right|-bottom|-left)?|gap|row-gap|column-gap|top|left|right|bottom)$/;

function inc<K>(map: Map<K, number>, key: K): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function normalizeHex(raw: string): string | null {
  const parsed = parseColor(raw.trim());
  if (!parsed) return null;
  return formatHex(parsed) ?? null;
}

function collectColors(value: string, map: Map<string, number>): void {
  if (isVarToken(value)) return;
  for (const m of matchColorValues(value)) {
    const hex = normalizeHex(m);
    if (hex) inc(map, hex);
  }
}

function collectPxValues(value: string, map: Map<number, number>): void {
  if (isVarToken(value)) return;
  const parts = value.trim().replace(/\//g, ' ').split(/\s+/);
  for (const part of parts) {
    const parsed = parseValue(part);
    if (parsed.unit === 'px' && parsed.value !== null) inc(map, parsed.value);
  }
}

function processDecl(prop: string, value: string, tokens: ExtractedTokens): void {
  if (COLOR_PROP_RE.test(prop)) {
    collectColors(value, tokens.colors);
  }
  if (SPACING_PROP_RE.test(prop)) {
    collectPxValues(value, tokens.spacing);
  }
  if (prop === 'font-size') {
    collectPxValues(value, tokens.fontSizes);
  }
  if (prop === 'font-family') {
    const first = value.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '');
    if (
      first &&
      !first.startsWith('var(--') &&
      !FONT_FAMILY_KEYWORDS.has(first.toLowerCase())
    ) {
      inc(tokens.fontFamilies, first);
    }
  }
  if (prop === 'border-radius') {
    collectPxValues(value, tokens.radii);
  }
}

function walkAst(node: TSESTree.Node, visit: (node: TSESTree.Node) => void): void {
  visit(node);
  const record = node as unknown as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const child = record[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && 'type' in item) {
          walkAst(item as TSESTree.Node, visit);
        }
      }
    } else if (child && typeof child === 'object' && 'type' in child) {
      walkAst(child as TSESTree.Node, visit);
    }
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

// Yields { prop, value } pairs from a JSX inline style={{ ... }} attribute.
function* inlineStylePairs(
  node: TSESTree.Node,
): Generator<{ prop: string; value: string }> {
  if (node.type !== 'JSXAttribute') return;
  const attr = node as TSESTree.JSXAttribute;
  if (attr.name.type !== 'JSXIdentifier' || attr.name.name !== 'style') return;
  if (!attr.value || attr.value.type !== 'JSXExpressionContainer') return;
  const expr = attr.value.expression;
  if (expr.type !== 'ObjectExpression') return;

  for (const prop of expr.properties) {
    if (prop.type !== 'Property') continue;
    const p = prop as TSESTree.Property;
    const keyNode = p.key;
    const valNode = p.value;

    const propName =
      keyNode.type === 'Identifier'
        ? keyNode.name
        : keyNode.type === 'Literal' && typeof keyNode.value === 'string'
          ? keyNode.value
          : null;
    if (!propName) continue;

    const propValue =
      valNode.type === 'Literal' && valNode.value !== null
        ? String(valNode.value)
        : valNode.type === 'TemplateLiteral' && valNode.quasis.length === 1
          ? (valNode.quasis[0]!.value.cooked ?? null)
          : null;
    if (propValue === null) continue;

    yield { prop: propName.replace(/([A-Z])/g, '-$1').toLowerCase(), value: propValue };
  }
}

export function extract(files: Map<string, string>): ExtractedTokens {
  const tokens: ExtractedTokens = {
    colors: new Map(),
    spacing: new Map(),
    fontSizes: new Map(),
    fontFamilies: new Map(),
    radii: new Map(),
    cssVars: new Map(),
  };

  const QUOTED_FONT_RE = /['"]([A-Za-z][^'"]{1,50})['"]/g;

  for (const [filePath, code] of files) {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';

    if (ext === 'css') {
      const root = parseCss(code);
      root.walkDecls((decl) => processDecl(decl.prop, decl.value, tokens));
      root.walkRules(':root', (rule) => {
        rule.walkDecls(/^--/, (decl) => {
          const hex = normalizeHex(decl.value.trim());
          if (hex && !tokens.cssVars.has(hex)) {
            tokens.cssVars.set(hex, decl.prop);
          }
          QUOTED_FONT_RE.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = QUOTED_FONT_RE.exec(decl.value)) !== null) {
            const name = m[1]!.trim();
            if (name && !FONT_FAMILY_KEYWORDS.has(name.toLowerCase())) {
              inc(tokens.fontFamilies, name);
            }
          }
        });
      });
    } else if (ext === 'tsx' || ext === 'jsx') {
      const ast = parseJsx(code);
      walkAst(ast, (node) => {
        // Direct color JSX attribute: <Comp color="#ff0000" />
        if (node.type === 'JSXAttribute') {
          const attr = node as TSESTree.JSXAttribute;
          const rawName = attr.name.type === 'JSXIdentifier' ? attr.name.name : null;
          if (rawName && rawName !== 'style') {
            const cssProp = rawName.replace(/([A-Z])/g, '-$1').toLowerCase();
            const value = extractAttrStringValue(attr);
            if (value !== null) processDecl(cssProp, value, tokens);
          }
        }

        // Inline style={{ ... }}
        for (const { prop, value } of inlineStylePairs(node)) {
          processDecl(prop, value, tokens);
        }
      });
    }
  }

  return tokens;
}
