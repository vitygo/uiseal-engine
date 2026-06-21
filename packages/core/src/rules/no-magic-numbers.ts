import type { TSESTree } from '@typescript-eslint/types';
import type { Rule, RuleContext } from './types.js';

// -1, 0, 1, 2 are universally understood — never flag them.
const SAFE = new Set([-1, 0, 1, 2]);

function reportIfMagic(node: TSESTree.Node, ctx: RuleContext): void {
  if (node.type !== 'Literal') return;
  const lit = node as TSESTree.Literal;
  if (typeof lit.value !== 'number') return;
  if (SAFE.has(lit.value as number)) return;
  ctx.report({
    ruleId: 'no-magic-numbers',
    message: `Magic number ${lit.value as number}. Extract to a named constant.`,
    line: lit.loc?.start.line ?? 1,
    column: lit.loc?.start.column ?? 0,
  });
}

export const noMagicNumbers: Rule = {
  id: 'no-magic-numbers',
  category: 'quality',
  defaultSeverity: 'warning',

  checkJsxNode(node: TSESTree.Node, ctx: RuleContext): void {
    // x * 86400, y + 3600, etc. — flag magic operands
    if (node.type === 'BinaryExpression') {
      const bin = node as TSESTree.BinaryExpression;
      reportIfMagic(bin.left as TSESTree.Node, ctx);
      reportIfMagic(bin.right as TSESTree.Node, ctx);
      return;
    }

    // return 86400 — bare numeric return
    if (node.type === 'ReturnStatement') {
      const ret = node as TSESTree.ReturnStatement;
      if (ret.argument) reportIfMagic(ret.argument as TSESTree.Node, ctx);
      return;
    }

    // x ? 86400 : 0 — magic in ternary branch
    if (node.type === 'ConditionalExpression') {
      const cond = node as TSESTree.ConditionalExpression;
      reportIfMagic(cond.consequent as TSESTree.Node, ctx);
      reportIfMagic(cond.alternate as TSESTree.Node, ctx);
      return;
    }

    // setTimeout(fn, 3600000) — magic call argument
    if (node.type === 'CallExpression') {
      const call = node as TSESTree.CallExpression;
      for (const arg of call.arguments) {
        if (arg.type !== 'SpreadElement') {
          reportIfMagic(arg as TSESTree.Node, ctx);
        }
      }
      return;
    }
  },
};
