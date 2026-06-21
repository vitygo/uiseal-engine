import type { TSESTree } from '@typescript-eslint/types';
import type { Rule, RuleContext } from './types.js';

export const noInlineStyles: Rule = {
  id: 'no-inline-styles',
  category: 'quality',
  defaultSeverity: 'warning',

  checkJsxNode(node: TSESTree.Node, ctx: RuleContext): void {
    if (node.type !== 'JSXOpeningElement') return;
    const el = node as TSESTree.JSXOpeningElement;

    const styleAttr = el.attributes
      .filter((a): a is TSESTree.JSXAttribute => a.type === 'JSXAttribute')
      .find((a) => a.name.type === 'JSXIdentifier' && a.name.name === 'style');

    if (!styleAttr) return;
    if (!styleAttr.value || styleAttr.value.type !== 'JSXExpressionContainer') return;

    const expr = styleAttr.value.expression;
    if (expr.type !== 'ObjectExpression') return;
    if (expr.properties.length === 0) return;

    const propNames: string[] = [];
    for (const prop of expr.properties) {
      if (prop.type !== 'Property') continue;
      const p = prop as TSESTree.Property;
      const key = p.key;
      if (key.type === 'Identifier') {
        propNames.push(key.name);
      } else if (key.type === 'Literal' && typeof key.value === 'string') {
        propNames.push(key.value);
      }
    }

    if (propNames.length === 0) return;

    ctx.report({
      ruleId: 'no-inline-styles',
      message: `Inline styles found: ${propNames.join(', ')}. Move to a CSS class or design token. Add /* uiseal-ignore no-inline-styles -- reason */ above this line if intentional.`,
      line: el.loc?.start.line ?? 1,
      column: el.loc?.start.column ?? 0,
    });
  },
};
