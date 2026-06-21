import type { TSESTree } from '@typescript-eslint/types';
import type { Rule, RuleContext } from './types.js';

export const noAutofocus: Rule = {
  id: 'no-autofocus',
  category: 'a11y',
  defaultSeverity: 'warning',

  checkJsxNode(node: TSESTree.Node, ctx: RuleContext): void {
    if (node.type !== 'JSXAttribute') return;
    const attr = node as TSESTree.JSXAttribute;
    if (attr.name.type !== 'JSXIdentifier' || attr.name.name !== 'autoFocus') return;

    ctx.report({
      ruleId: 'no-autofocus',
      message: 'Avoid autoFocus — it can disorient screen reader users.',
      line: attr.loc?.start.line ?? 1,
      column: attr.loc?.start.column ?? 0,
    });
  },
};
