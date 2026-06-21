import type { TSESTree } from '@typescript-eslint/types';
import type { Rule, RuleContext } from './types.js';

const SANITIZER_RE = /sanitize|purify|clean/i;

function isSanitizerCall(node: TSESTree.Node): boolean {
  if (node.type !== 'CallExpression') return false;
  const call = node as TSESTree.CallExpression;
  const callee = call.callee;
  if (callee.type === 'Identifier') return SANITIZER_RE.test((callee as TSESTree.Identifier).name);
  if (callee.type === 'MemberExpression') {
    const prop = (callee as TSESTree.MemberExpression).property;
    if (prop.type === 'Identifier') return SANITIZER_RE.test((prop as TSESTree.Identifier).name);
  }
  return false;
}

export const noXssDangerous: Rule = {
  id: 'no-xss-dangerous',
  category: 'security',
  defaultSeverity: 'error',

  checkJsxNode(node: TSESTree.Node, ctx: RuleContext): void {
    if (node.type !== 'JSXAttribute') return;
    const attr = node as TSESTree.JSXAttribute;
    if (attr.name.type !== 'JSXIdentifier' || attr.name.name !== 'dangerouslySetInnerHTML') return;

    if (attr.value?.type === 'JSXExpressionContainer') {
      const expr = (attr.value as TSESTree.JSXExpressionContainer).expression;
      if (expr.type === 'ObjectExpression') {
        for (const prop of (expr as TSESTree.ObjectExpression).properties) {
          if (prop.type !== 'Property') continue;
          const p = prop as TSESTree.Property;
          const keyName =
            p.key.type === 'Identifier' ? (p.key as TSESTree.Identifier).name :
            p.key.type === 'Literal' ? String((p.key as TSESTree.Literal).value) : null;
          if (keyName !== '__html') continue;
          if (isSanitizerCall(p.value as TSESTree.Node)) return;
          break;
        }
      }
    }

    ctx.report({
      ruleId: 'no-xss-dangerous',
      message:
        'dangerouslySetInnerHTML without sanitization is an XSS risk. Wrap the value in a sanitizer (e.g. DOMPurify.sanitize).',
      line: attr.loc?.start.line ?? 1,
      column: attr.loc?.start.column ?? 0,
    });
  },
};
