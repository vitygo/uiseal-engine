import type { TSESTree } from '@typescript-eslint/types';
import type { Rule, RuleContext } from './types.js';

export const noAutofocus: Rule = {
  id: 'no-autofocus',
  category: 'a11y',
  defaultSeverity: 'warning',
  shortDescription: 'Disallow the autoFocus attribute',
  fullDescription:
    'Flags autoFocus, which moves keyboard and screen-reader focus without the user taking any action. This is disorienting for screen reader users and often surprising for sighted users on page load.',
  helpUri: 'https://uiseal.io/docs/rules/no-autofocus',

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
