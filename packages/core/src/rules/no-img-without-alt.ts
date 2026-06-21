import type { TSESTree } from '@typescript-eslint/types';
import type { Rule, RuleContext } from './types.js';

function getAttrName(attr: TSESTree.JSXAttribute): string | null {
  if (attr.name.type === 'JSXIdentifier') return attr.name.name;
  return null;
}

function isUndefinedValue(val: TSESTree.JSXAttribute['value']): boolean {
  if (val?.type === 'JSXExpressionContainer') {
    const expr = val.expression;
    return expr.type === 'Identifier' && expr.name === 'undefined';
  }
  return false;
}

export const noImgWithoutAlt: Rule = {
  id: 'no-img-without-alt',
  category: 'a11y',
  defaultSeverity: 'error',

  checkJsxNode(node: TSESTree.Node, ctx: RuleContext): void {
    if (node.type !== 'JSXOpeningElement') return;
    const el = node as TSESTree.JSXOpeningElement;
    if (el.name.type !== 'JSXIdentifier' || el.name.name !== 'img') return;

    const altAttr = el.attributes.find(
      (a): a is TSESTree.JSXAttribute =>
        a.type === 'JSXAttribute' && getAttrName(a as TSESTree.JSXAttribute) === 'alt',
    ) as TSESTree.JSXAttribute | undefined;

    if (!altAttr || isUndefinedValue(altAttr.value)) {
      ctx.report({
        ruleId: 'no-img-without-alt',
        message:
          'Image is missing alt text. Add alt="" for decorative images or a descriptive alt for content images.',
        line: el.loc?.start.line ?? 1,
        column: el.loc?.start.column ?? 0,
      });
    }
  },
};
