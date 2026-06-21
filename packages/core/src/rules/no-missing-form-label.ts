import type { TSESTree } from '@typescript-eslint/types';
import type { Rule, RuleContext } from './types.js';

const EXEMPT_TYPES = new Set(['submit', 'reset', 'button', 'hidden', 'image']);
const LABELED_ELEMENTS = new Set(['input', 'textarea', 'select']);

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

export const noMissingFormLabel: Rule = {
  id: 'no-missing-form-label',
  category: 'a11y',
  defaultSeverity: 'error',

  checkJsxNode(node: TSESTree.Node, ctx: RuleContext): void {
    if (node.type !== 'JSXOpeningElement') return;
    const el = node as TSESTree.JSXOpeningElement;
    if (el.name.type !== 'JSXIdentifier') return;
    const tagName = el.name.name;
    if (!LABELED_ELEMENTS.has(tagName)) return;

    const jsxAttrs = el.attributes.filter(
      (a): a is TSESTree.JSXAttribute => a.type === 'JSXAttribute',
    );

    if (tagName === 'input') {
      const typeAttr = jsxAttrs.find((a) => getAttrName(a) === 'type');
      if (typeAttr) {
        const typeVal = getStringAttrValue(typeAttr);
        if (typeVal && EXEMPT_TYPES.has(typeVal.toLowerCase())) return;
      }
    }

    const hasAriaLabel = jsxAttrs.some((a) => getAttrName(a) === 'aria-label');
    const hasAriaLabelledby = jsxAttrs.some((a) => getAttrName(a) === 'aria-labelledby');

    if (!hasAriaLabel && !hasAriaLabelledby) {
      ctx.report({
        ruleId: 'no-missing-form-label',
        message: `${tagName.charAt(0).toUpperCase() + tagName.slice(1)} is missing an accessible label.`,
        line: el.loc?.start.line ?? 1,
        column: el.loc?.start.column ?? 0,
      });
    }
  },
};
