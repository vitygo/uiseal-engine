// Converts Vue template :style / style bindings into postcss
// Declaration-like objects, reusing the exact same object->decl conversion
// as the JSX style={{}} adapter (adapters/object-expr-to-decls.ts) — a Vue
// :style="{ padding: '13px' }" object literal is the same JS object shape
// as a JSX inline style prop, just embedded as raw text in an attribute
// rather than already being part of the surrounding AST.
import type { Declaration } from 'postcss';
import { parseJsx } from '../parsers/jsx.js';
import { objectExpressionToDecls, makeSyntheticDecl } from '../adapters/object-expr-to-decls.js';

// Vue's template AST (@vue/compiler-sfc) is not TSESTree — it has its own
// node shapes (ElementNode, AttributeNode, DirectiveNode, ...). Using `any`
// here mirrors runner.ts's own walkAst, which treats TSESTree.Node generically
// the same way; there's no shared type to narrow to.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VueNode = any;

const NODE_ELEMENT = 1;
const NODE_ATTRIBUTE = 6;
const NODE_DIRECTIVE = 7;

/** Recursively visits every node in a Vue template AST (skips `loc`/`codegenNode` — position data and a duplicate compiled-output tree, not template structure). */
export function walkVueTemplate(node: VueNode, visit: (node: VueNode) => void): void {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'codegenNode') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object') walkVueTemplate(item, visit);
      }
    } else if (child && typeof child === 'object' && 'type' in child) {
      walkVueTemplate(child, visit);
    }
  }
}

// Parses a Vue directive expression's raw text (e.g. "{ padding: '13px' }")
// as a standalone JS expression. Wrapped in parens to force expression
// (not block-statement) context, matching how `{ ... }` at statement
// position would otherwise parse as a block.
function parseObjectLiteralText(exprText: string): ReturnType<typeof parseJsx>['body'][number] | null {
  try {
    const program = parseJsx(`(${exprText})`);
    return program.body[0] ?? null;
  } catch {
    return null; // not statically parseable (dynamic/computed) — skip
  }
}

/**
 * Extracts CSS Declarations from a single ELEMENT node's :style binding or
 * static style="..." attribute.
 *
 * Every declaration from ONE binding shares a single reported position (the
 * binding's own start), rather than each property getting its own —
 * consistent with how this codebase already treats other multi-value
 * positions (a CSS shorthand's parts, a JSX inline style object): the
 * exact expression text is re-parsed in isolation, so individual
 * property locs inside it are relative to that isolated snippet, not the
 * real .vue file; only the directive/attribute's own loc (already
 * absolute — see parsers/vue.ts) is trustworthy.
 */
export function extractVueInlineStyleDecls(node: VueNode): Declaration[] {
  if (!node || node.type !== NODE_ELEMENT) return [];
  const props: VueNode[] = node.props ?? [];
  const decls: Declaration[] = [];

  for (const prop of props) {
    if (prop.type === NODE_DIRECTIVE && prop.name === 'bind' && prop.arg?.content === 'style' && prop.exp) {
      const pos = { line: prop.exp.loc.start.line, column: prop.exp.loc.start.column };
      const stmt = parseObjectLiteralText(prop.exp.content);
      if (!stmt || stmt.type !== 'ExpressionStatement') continue;
      const expr = stmt.expression;
      if (expr.type !== 'ObjectExpression') continue; // e.g. :style="computedStyle" — dynamic, skip
      decls.push(...objectExpressionToDecls(expr, pos));
    } else if (prop.type === NODE_ATTRIBUTE && prop.name === 'style' && prop.value) {
      const pos = { line: prop.value.loc.start.line, column: prop.value.loc.start.column };
      for (const part of prop.value.content.split(';')) {
        const colonIdx = part.indexOf(':');
        if (colonIdx === -1) continue;
        const cssProp = part.slice(0, colonIdx).trim();
        const cssValue = part.slice(colonIdx + 1).trim();
        if (!cssProp || !cssValue) continue;
        decls.push(makeSyntheticDecl(cssProp, cssValue, pos));
      }
    }
  }

  return decls;
}
