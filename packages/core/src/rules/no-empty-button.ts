import type { TSESTree } from '@typescript-eslint/types';
import type { Rule, RuleContext } from './types.js';

function getAttrName(attr: TSESTree.JSXAttribute): string | null {
  if (attr.name.type === 'JSXIdentifier') return attr.name.name;
  return null;
}

function hasVisibleChildren(children: TSESTree.JSXChild[]): boolean {
  for (const child of children) {
    if (child.type === 'JSXElement' || child.type === 'JSXFragment') return true;
    if (child.type === 'JSXSpreadChild') return true;
    if (child.type === 'JSXExpressionContainer') {
      if (child.expression.type !== 'JSXEmptyExpression') return true;
    }
    if (child.type === 'JSXText' && child.value.trim().length > 0) return true;
  }
  return false;
}

export const noEmptyButton: Rule = {
  id: 'no-empty-button',
  category: 'a11y',
  defaultSeverity: 'error',

  checkJsxNode(node: TSESTree.Node, ctx: RuleContext): void {
    if (node.type !== 'JSXElement') return;
    const el = node as TSESTree.JSXElement;

    const opening = el.openingElement;
    if (opening.name.type !== 'JSXIdentifier' || opening.name.name !== 'button') return;

    const jsxAttrs = opening.attributes.filter(
      (a): a is TSESTree.JSXAttribute => a.type === 'JSXAttribute',
    );

    if (
      jsxAttrs.some((a) => getAttrName(a) === 'aria-label') ||
      jsxAttrs.some((a) => getAttrName(a) === 'aria-labelledby')
    ) {
      return;
    }

    if (!hasVisibleChildren(el.children)) {
      ctx.report({
        ruleId: 'no-empty-button',
        message: 'Button has no accessible label. Add aria-label or visible text content.',
        line: opening.loc?.start.line ?? 1,
        column: opening.loc?.start.column ?? 0,
      });
    }
  },
};
