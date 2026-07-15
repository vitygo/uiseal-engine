// Extracts class-name strings from a JS expression AST node — the shape a
// Vue :class="..." or Angular [ngClass]="..." binding's expression text
// parses into once run through parseExpressionText(). Shared because the
// binding semantics are identical across frameworks: an object's keys are
// class names (conditionally applied, but checkable regardless — this is
// static analysis, not runtime evaluation), an array's elements are more of
// the same recursively, and only what's statically knowable is read.
import type { TSESTree } from '@typescript-eslint/types';

export function extractClassStringsFromExpr(expr: TSESTree.Node): string[] {
  if (expr.type === 'Literal' && typeof expr.value === 'string') return [expr.value];

  if (expr.type === 'ObjectExpression') {
    const names: string[] = [];
    for (const prop of expr.properties) {
      if (prop.type !== 'Property') continue;
      const key = prop.key;
      const name =
        key.type === 'Literal' && typeof key.value === 'string'
          ? key.value
          : key.type === 'Identifier'
            ? key.name
            : null;
      if (name) names.push(name);
    }
    return names;
  }

  if (expr.type === 'ArrayExpression') {
    const names: string[] = [];
    for (const el of expr.elements) {
      if (el) names.push(...extractClassStringsFromExpr(el));
    }
    return names;
  }

  if (expr.type === 'ConditionalExpression') {
    return [...extractClassStringsFromExpr(expr.consequent), ...extractClassStringsFromExpr(expr.alternate)];
  }

  return [];
}
