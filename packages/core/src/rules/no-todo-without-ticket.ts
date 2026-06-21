import type { Comment } from 'postcss';
import type { TSESTree } from '@typescript-eslint/types';
import type { Rule, RuleContext } from './types.js';

const TODO_RE = /\b(?:TODO|FIXME)\b/i;
// Matches: #123, PROJ-123, [PROJ-123], GH-123, or any http/https URL
const TICKET_RE = /(?:#\d+|[A-Z][A-Z0-9_]*-\d+|\[[A-Z][A-Z0-9_]*-\d+\]|https?:\/\/)/;

const MSG =
  'TODO/FIXME without a ticket reference. Add #issue, PROJ-123, or a URL.';

function checkCommentText(
  text: string,
  line: number,
  column: number,
  ctx: RuleContext,
): void {
  if (!TODO_RE.test(text)) return;
  if (TICKET_RE.test(text)) return;
  ctx.report({ ruleId: 'no-todo-without-ticket', message: MSG, line, column });
}

export const noTodoWithoutTicket: Rule = {
  id: 'no-todo-without-ticket',
  category: 'quality',
  defaultSeverity: 'warning',

  checkCssComment(comment: Comment, ctx: RuleContext): void {
    checkCommentText(
      comment.text,
      comment.source?.start?.line ?? 1,
      comment.source?.start?.column ?? 0,
      ctx,
    );
  },

  // Scan all file comments at once from the Program node (always visited first).
  // Comments are TSESTree.Comment, not TSESTree.Node, so they cannot be matched
  // by node.type inside a regular walkAst visitor — access them via program.comments.
  checkJsxNode(node: TSESTree.Node, ctx: RuleContext): void {
    if (node.type !== 'Program') return;
    const prog = node as TSESTree.Program;
    for (const comment of prog.comments ?? []) {
      checkCommentText(
        comment.value,
        comment.loc?.start.line ?? 1,
        comment.loc?.start.column ?? 0,
        ctx,
      );
    }
  },
};
