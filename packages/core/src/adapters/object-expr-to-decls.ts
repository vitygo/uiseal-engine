// Converts a JS object-literal AST node (the shape of a JSX style={{}} prop,
// or a Vue :style="{}" binding once its expression text is parsed as a
// standalone snippet) into postcss Declaration-like objects, so the
// existing CSS rule set (checkCssDeclaration) can run on inline styles
// exactly like it runs on real CSS. Shared by the JSX adapter (runner.ts)
// and the Vue template adapter (vue/template-adapter.ts) — the object
// shape and property/value extraction rules are identical either way.
import type { Declaration } from 'postcss';
import type { TSESTree } from '@typescript-eslint/types';

export interface SyntheticDeclPosition {
  line: number;
  column: number;
}

export function makeSyntheticDecl(
  prop: string,
  value: string,
  pos: SyntheticDeclPosition,
): Declaration {
  return {
    type: 'decl',
    prop,
    value,
    important: false,
    source: {
      start: { line: pos.line, column: pos.column, offset: 0 },
      end: { line: pos.line, column: pos.column, offset: 0 },
    },
  } as unknown as Declaration;
}

/**
 * @param position When provided, every returned Declaration uses this single
 *   position rather than each property's own AST loc — needed when `expr`
 *   was parsed from an isolated text snippet (Vue :style), whose internal
 *   locs are relative to that snippet, not the real file.
 */
export function objectExpressionToDecls(
  expr: TSESTree.ObjectExpression,
  position?: SyntheticDeclPosition,
): Declaration[] {
  const decls: Declaration[] = [];

  for (const prop of expr.properties) {
    if (prop.type !== 'Property') continue;
    const p = prop as TSESTree.Property;
    const keyNode = p.key;
    const valueNode = p.value;

    const propName =
      keyNode.type === 'Identifier'
        ? keyNode.name
        : keyNode.type === 'Literal' && typeof keyNode.value === 'string'
          ? keyNode.value
          : null;
    if (!propName) continue;

    const propValue =
      valueNode.type === 'Literal' && valueNode.value !== null
        ? String(valueNode.value)
        : valueNode.type === 'TemplateLiteral' && valueNode.quasis.length === 1
          ? (valueNode.quasis[0]!.value.cooked ?? '')
          : null;
    if (propValue === null) continue;

    // camelCase → kebab-case for CSS property name.
    const cssProperty = propName.replace(/([A-Z])/g, '-$1').toLowerCase();

    const pos = position ?? {
      line: p.loc?.start.line ?? 1,
      column: p.loc?.start.column ?? 0,
    };
    decls.push(makeSyntheticDecl(cssProperty, propValue, pos));
  }

  return decls;
}
