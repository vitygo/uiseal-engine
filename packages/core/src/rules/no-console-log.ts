import type { TSESTree } from '@typescript-eslint/types';
import type { Rule, RuleContext } from './types.js';

const DISABLE_RE = /eslint-disable/i;
// Module-level set rebuilt on each Program node visit (first node in every file).
const _disabledLines = new Set<number>();

function resetDisabledLines(program: TSESTree.Program): void {
  _disabledLines.clear();
  for (const comment of program.comments ?? []) {
    if (comment.loc && DISABLE_RE.test(comment.value)) {
      _disabledLines.add(comment.loc.start.line);
    }
  }
}

export const noConsoleLog: Rule = {
  id: 'no-console-log',
  category: 'quality',
  defaultSeverity: 'warning',

  checkJsxNode(node: TSESTree.Node, ctx: RuleContext): void {
    // Program is always the first node visited per file; use it to collect
    // disable-comment lines before checking any CallExpressions below.
    if (node.type === 'Program') {
      resetDisabledLines(node as TSESTree.Program);
      return;
    }

    if (node.type !== 'CallExpression') return;
    const call = node as TSESTree.CallExpression;
    if (call.callee.type !== 'MemberExpression') return;
    const callee = call.callee as TSESTree.MemberExpression;
    if (callee.object.type !== 'Identifier') return;
    if ((callee.object as TSESTree.Identifier).name !== 'console') return;
    if (callee.property.type !== 'Identifier') return;
    if ((callee.property as TSESTree.Identifier).name !== 'log') return;

    const line = call.loc?.start.line ?? -1;
    if (_disabledLines.has(line)) return;

    ctx.report({
      ruleId: 'no-console-log',
      message:
        'Remove console.log before committing. Use a logger or console.warn/error for intentional output.',
      line,
      column: call.loc?.start.column ?? 0,
    });
  },
};
