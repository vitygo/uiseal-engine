import type { TSESTree } from '@typescript-eslint/types';
import type { Rule, RuleContext } from './types.js';

const CONSOLE_METHODS = new Set(['log', 'info', 'warn', 'error', 'debug']);
const SENSITIVE_RE = /token|password|passwd|secret|apikey|api_key|auth|credential|private_?key|session/i;

function findSensitiveName(node: TSESTree.Node): string | null {
  if (node.type === 'Identifier') {
    const name = (node as TSESTree.Identifier).name;
    return SENSITIVE_RE.test(name) ? name : null;
  }

  if (node.type === 'MemberExpression') {
    const prop = (node as TSESTree.MemberExpression).property;
    if (prop.type === 'Identifier') {
      const name = (prop as TSESTree.Identifier).name;
      return SENSITIVE_RE.test(name) ? name : null;
    }
    return null;
  }

  if (node.type === 'ObjectExpression') {
    for (const prop of (node as TSESTree.ObjectExpression).properties) {
      if (prop.type !== 'Property') continue;
      const p = prop as TSESTree.Property;
      const keyName =
        p.key.type === 'Identifier' ? (p.key as TSESTree.Identifier).name :
        p.key.type === 'Literal' ? String((p.key as TSESTree.Literal).value) : null;
      if (keyName && SENSITIVE_RE.test(keyName)) return keyName;
    }
    return null;
  }

  if (node.type === 'TemplateLiteral') {
    for (const expr of (node as TSESTree.TemplateLiteral).expressions) {
      const name = findSensitiveName(expr as TSESTree.Node);
      if (name) return name;
    }
    return null;
  }

  return null;
}

export const noConsoleSensitive: Rule = {
  id: 'no-console-sensitive',
  category: 'security',
  defaultSeverity: 'warning',

  checkJsxNode(node: TSESTree.Node, ctx: RuleContext): void {
    if (node.type !== 'CallExpression') return;
    const call = node as TSESTree.CallExpression;

    if (call.callee.type !== 'MemberExpression') return;
    const callee = call.callee as TSESTree.MemberExpression;
    if (callee.object.type !== 'Identifier') return;
    if ((callee.object as TSESTree.Identifier).name !== 'console') return;
    if (callee.property.type !== 'Identifier') return;
    if (!CONSOLE_METHODS.has((callee.property as TSESTree.Identifier).name)) return;

    for (const arg of call.arguments) {
      if (arg.type === 'SpreadElement') continue;
      const sensitiveName = findSensitiveName(arg as TSESTree.Node);
      if (sensitiveName) {
        ctx.report({
          ruleId: 'no-console-sensitive',
          message: `Logging sensitive data (${sensitiveName}) can leak credentials. Remove it or redact before logging.`,
          line: call.loc?.start.line ?? 1,
          column: call.loc?.start.column ?? 0,
        });
        return;
      }
    }
  },
};
