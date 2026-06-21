import type { TSESTree } from '@typescript-eslint/types';
import type { Rule, RuleContext } from './types.js';

function getAttrName(attr: TSESTree.JSXAttribute): string | null {
  if (attr.name.type === 'JSXIdentifier') return attr.name.name;
  return null;
}

function getStringAttrValue(attr: TSESTree.JSXAttribute): string | null {
  const v = attr.value;
  if (!v) return null;
  if (v.type === 'Literal' && typeof v.value === 'string') return v.value;
  if (v.type === 'JSXExpressionContainer') {
    const expr = v.expression;
    if (expr.type === 'Literal' && typeof expr.value === 'string') return expr.value;
  }
  return null;
}

export const noDivButton: Rule = {
  id: 'no-div-button',
  category: 'a11y',
  defaultSeverity: 'warning',

  checkJsxNode(node: TSESTree.Node, ctx: RuleContext): void {
    if (node.type !== 'JSXOpeningElement') return;
    const el = node as TSESTree.JSXOpeningElement;
    if (el.name.type !== 'JSXIdentifier') return;
    const tagName = el.name.name;
    if (tagName !== 'div' && tagName !== 'span') return;

    const jsxAttrs = el.attributes.filter(
      (a): a is TSESTree.JSXAttribute => a.type === 'JSXAttribute',
    );

    const hasOnClick = jsxAttrs.some((a) => getAttrName(a) === 'onClick');
    if (!hasOnClick) return;

    const roleAttr = jsxAttrs.find((a) => getAttrName(a) === 'role');
    const hasRoleButton = roleAttr ? getStringAttrValue(roleAttr) === 'button' : false;
    const hasTabIndex = jsxAttrs.some((a) => getAttrName(a) === 'tabIndex');
    const hasKeyHandler = jsxAttrs.some(
      (a) => getAttrName(a) === 'onKeyDown' || getAttrName(a) === 'onKeyPress',
    );

    if (!hasRoleButton || !hasTabIndex || !hasKeyHandler) {
      ctx.report({
        ruleId: 'no-div-button',
        message:
          "div/span with onClick needs role='button', tabIndex={0}, AND an onKeyDown handler for keyboard accessibility.",
        line: el.loc?.start.line ?? 1,
        column: el.loc?.start.column ?? 0,
      });
    }
  },
};
