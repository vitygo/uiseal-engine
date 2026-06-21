import type { TSESTree } from '@typescript-eslint/types';
import type { Rule, RuleContext } from './types.js';

const LINE_LIMIT = 300;

function isComponentName(name: string | null | undefined): name is string {
  return typeof name === 'string' && /^[A-Z]/.test(name);
}

function checkBody(
  name: string,
  body: TSESTree.BlockStatement,
  ctx: RuleContext,
): void {
  if (!body.loc) return;
  const lines = body.loc.end.line - body.loc.start.line + 1;
  if (lines <= LINE_LIMIT) return;
  ctx.report({
    ruleId: 'no-oversized-component',
    message: `Component ${name} is ${lines} lines. Consider splitting components over ${LINE_LIMIT} lines.`,
    line: body.loc.start.line,
    column: body.loc.start.column,
  });
}

export const noOversizedComponent: Rule = {
  id: 'no-oversized-component',
  category: 'quality',
  defaultSeverity: 'warning',

  checkJsxNode(node: TSESTree.Node, ctx: RuleContext): void {
    // function MyComponent() { ... }
    if (node.type === 'FunctionDeclaration') {
      const fn = node as TSESTree.FunctionDeclaration;
      if (!isComponentName(fn.id?.name)) return;
      if (fn.body.type !== 'BlockStatement') return;
      checkBody(fn.id!.name, fn.body as TSESTree.BlockStatement, ctx);
      return;
    }

    // const MyComponent = () => { ... }
    // const MyComponent = function() { ... }
    if (node.type === 'VariableDeclarator') {
      const vd = node as TSESTree.VariableDeclarator;
      if (!vd.id || vd.id.type !== 'Identifier') return;
      const name = (vd.id as TSESTree.Identifier).name;
      if (!isComponentName(name)) return;
      if (!vd.init) return;
      const init = vd.init as TSESTree.Node;
      if (init.type === 'ArrowFunctionExpression') {
        const arrow = init as TSESTree.ArrowFunctionExpression;
        if (arrow.body.type !== 'BlockStatement') return;
        checkBody(name, arrow.body as TSESTree.BlockStatement, ctx);
      } else if (init.type === 'FunctionExpression') {
        const fn = init as TSESTree.FunctionExpression;
        checkBody(name, fn.body as TSESTree.BlockStatement, ctx);
      }
      return;
    }
  },
};
