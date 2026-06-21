import type { TSESTree } from '@typescript-eslint/types';
import type { Rule, RuleContext } from './types.js';

const SERVER_PATH_RE = /\.server\.|\/server\/|\/api\/|(?:^|[/.])(?:next|vite|webpack|jest|vitest)\.config\.[jt]s$|\/scripts\//;
const PUBLIC_ENV_RE = /^(NEXT_PUBLIC_|VITE_|PUBLIC_|REACT_APP_)/;

// Populated when the Program node is visited (always first in walkAst).
// Tracks files that have a "use server" directive so subsequent node visits
// can skip them without re-scanning. Must be cleared at the start of each
// top-level analyze() call to prevent unbounded growth across repeated scans.
const _useServerCache = new Map<string, boolean>();

export function clearEnvInClientCache(): void {
  _useServerCache.clear();
}

function getEnvVarName(node: TSESTree.MemberExpression): string | null {
  if (node.computed) {
    const prop = node.property;
    if (prop.type === 'Literal' && typeof (prop as TSESTree.Literal).value === 'string') {
      return String((prop as TSESTree.Literal).value);
    }
    return null;
  }
  const prop = node.property;
  if (prop.type === 'Identifier') return (prop as TSESTree.Identifier).name;
  return null;
}

function asProcessEnvAccess(node: TSESTree.Node): TSESTree.MemberExpression | null {
  if (node.type !== 'MemberExpression') return null;
  const outer = node as TSESTree.MemberExpression;
  if (outer.object.type !== 'MemberExpression') return null;
  const inner = outer.object as TSESTree.MemberExpression;
  if (inner.object.type !== 'Identifier') return null;
  if ((inner.object as TSESTree.Identifier).name !== 'process') return null;
  if (inner.property.type !== 'Identifier') return null;
  if ((inner.property as TSESTree.Identifier).name !== 'env') return null;
  return outer;
}

export const noEnvInClient: Rule = {
  id: 'no-env-in-client',
  category: 'security',
  defaultSeverity: 'error',

  checkJsxNode(node: TSESTree.Node, ctx: RuleContext): void {
    if (node.type === 'Program') {
      const prog = node as TSESTree.Program;
      const firstStmt = prog.body[0];
      const hasUseServer =
        firstStmt?.type === 'ExpressionStatement' &&
        (firstStmt as TSESTree.ExpressionStatement).expression.type === 'Literal' &&
        ((firstStmt as TSESTree.ExpressionStatement).expression as TSESTree.Literal).value ===
          'use server';
      _useServerCache.set(ctx.currentFile, hasUseServer);
      return;
    }

    if (SERVER_PATH_RE.test(ctx.currentFile)) return;
    if (_useServerCache.get(ctx.currentFile) === true) return;

    const access = asProcessEnvAccess(node);
    if (!access) return;

    const name = getEnvVarName(access);
    if (name !== null && PUBLIC_ENV_RE.test(name)) return;

    ctx.report({
      ruleId: 'no-env-in-client',
      message: `process.env.${name ?? '[unknown]'} is exposed in client code. Move secrets to the server, or prefix with a public env var (e.g. NEXT_PUBLIC_).`,
      line: access.loc?.start.line ?? 1,
      column: access.loc?.start.column ?? 0,
    });
  },
};
