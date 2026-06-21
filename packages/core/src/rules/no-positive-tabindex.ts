import type { TSESTree } from '@typescript-eslint/types';
import type { Rule, RuleContext } from './types.js';

function extractNumericValue(val: TSESTree.JSXAttribute['value']): number | null {
  if (!val) return null;
  if (val.type === 'JSXExpressionContainer') {
    const expr = val.expression;
    if (expr.type === 'Literal' && typeof expr.value === 'number') return expr.value;
    if (
      expr.type === 'UnaryExpression' &&
      expr.operator === '-' &&
      expr.argument.type === 'Literal' &&
      typeof expr.argument.value === 'number'
    ) {
      return -expr.argument.value;
    }
  }
  if (val.type === 'Literal' && typeof val.value === 'number') return val.value;
  return null;
}

export const noPositiveTabindex: Rule = {
  id: 'no-positive-tabindex',
  category: 'a11y',
  defaultSeverity: 'warning',

  checkJsxNode(node: TSESTree.Node, ctx: RuleContext): void {
    if (node.type !== 'JSXAttribute') return;
    const attr = node as TSESTree.JSXAttribute;
    if (attr.name.type !== 'JSXIdentifier' || attr.name.name !== 'tabIndex') return;

    const num = extractNumericValue(attr.value);
    if (num !== null && num > 0) {
      ctx.report({
        ruleId: 'no-positive-tabindex',
        message: 'Avoid tabIndex > 0. It disrupts natural keyboard navigation order.',
        line: attr.loc?.start.line ?? 1,
        column: attr.loc?.start.column ?? 0,
      });
    }
  },
};
