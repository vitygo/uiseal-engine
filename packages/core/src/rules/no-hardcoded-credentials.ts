import type { TSESTree } from '@typescript-eslint/types';
import type { Rule, RuleContext } from './types.js';

const CREDENTIAL_KEY_RE = /key|secret|token|password|passwd|credential|auth/i;
const PLACEHOLDER_RE = /^(your|my|example|test|xxx|placeholder|changeme|<.*>|\.\.\.|process\.env)/i;
const KNOWN_PREFIX_RE = /^(sk-|pk-|ghp_|gho_|github_pat_|xox[bap]-|AKIA|AIza|eyJ)/;

function isHighEntropy(s: string): boolean {
  if (s.length < 20) return false;
  return /[A-Z]/.test(s) && /[a-z]/.test(s) && /[0-9]/.test(s);
}

function looksLikeSecret(value: string): boolean {
  if (!value) return false;
  if (PLACEHOLDER_RE.test(value)) return false;
  if (KNOWN_PREFIX_RE.test(value)) return true;
  return isHighEntropy(value);
}

function checkStringValue(
  valueNode: TSESTree.Node,
  keyName: string,
  line: number,
  column: number,
  ctx: RuleContext,
): void {
  if (valueNode.type !== 'Literal') return;
  const lit = valueNode as TSESTree.Literal;
  if (typeof lit.value !== 'string') return;
  if (looksLikeSecret(lit.value)) {
    ctx.report({
      ruleId: 'no-hardcoded-credentials',
      message: `Hardcoded credential in ${keyName}. Move it to an environment variable.`,
      line,
      column,
    });
  }
}

export const noHardcodedCredentials: Rule = {
  id: 'no-hardcoded-credentials',
  category: 'security',
  defaultSeverity: 'error',

  checkJsxNode(node: TSESTree.Node, ctx: RuleContext): void {
    if (node.type === 'VariableDeclarator') {
      const decl = node as TSESTree.VariableDeclarator;
      if (!decl.init) return;
      if (decl.id.type !== 'Identifier') return;
      const keyName = (decl.id as TSESTree.Identifier).name;
      if (!CREDENTIAL_KEY_RE.test(keyName)) return;
      checkStringValue(
        decl.init as TSESTree.Node,
        keyName,
        decl.loc?.start.line ?? 1,
        decl.loc?.start.column ?? 0,
        ctx,
      );
      return;
    }

    if (node.type === 'Property') {
      const prop = node as TSESTree.Property;
      const keyName =
        prop.key.type === 'Identifier' ? (prop.key as TSESTree.Identifier).name :
        prop.key.type === 'Literal' ? String((prop.key as TSESTree.Literal).value) : null;
      if (!keyName || !CREDENTIAL_KEY_RE.test(keyName)) return;
      checkStringValue(
        prop.value as TSESTree.Node,
        keyName,
        prop.loc?.start.line ?? 1,
        prop.loc?.start.column ?? 0,
        ctx,
      );
      return;
    }

    if (node.type === 'AssignmentExpression') {
      const assign = node as TSESTree.AssignmentExpression;
      const left = assign.left;
      let keyName: string | null = null;
      if (left.type === 'MemberExpression') {
        const prop = (left as TSESTree.MemberExpression).property;
        if (prop.type === 'Identifier') keyName = (prop as TSESTree.Identifier).name;
      } else if (left.type === 'Identifier') {
        keyName = (left as TSESTree.Identifier).name;
      }
      if (!keyName || !CREDENTIAL_KEY_RE.test(keyName)) return;
      checkStringValue(
        assign.right as TSESTree.Node,
        keyName,
        assign.loc?.start.line ?? 1,
        assign.loc?.start.column ?? 0,
        ctx,
      );
    }
  },
};
