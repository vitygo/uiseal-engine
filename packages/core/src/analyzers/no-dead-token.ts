import type { Root } from 'postcss';
import type { uisealConfig } from '../config/schema.js';
import type { Violation } from '../types.js';

const SKIP_RE = /^--tw-|^--vp-|^--_/;
const VAR_RE = /var\(\s*(--[\w-]+)/g;

export interface TokenDef {
  name: string;
  file: string;
  line: number;
  column: number;
}

export function collectDefinedTokens(filePath: string, root: Root): TokenDef[] {
  const defs: TokenDef[] = [];
  root.walkRules((rule) => {
    if (rule.selector.trim() !== ':root') return;
    rule.walkDecls((decl) => {
      if (!decl.prop.startsWith('--') || SKIP_RE.test(decl.prop)) return;
      defs.push({
        name: decl.prop,
        file: filePath,
        line: decl.source?.start?.line ?? 1,
        column: decl.source?.start?.column ?? 0,
      });
    });
  });
  return defs;
}

export function extractVarRefs(value: string): string[] {
  const refs: string[] = [];
  VAR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = VAR_RE.exec(value)) !== null) {
    refs.push(m[1]!);
  }
  return refs;
}

export function analyzeDeadTokens(
  defined: TokenDef[],
  used: Set<string>,
  config: uisealConfig,
): Violation[] {
  const override = config.rules['no-dead-token'];
  if (override === 'off') return [];
  const severity: 'error' | 'warning' = override === 'error' ? 'error' : 'warning';

  return defined
    .filter((def) => !used.has(def.name))
    .map((def) => ({
      ruleId: 'no-dead-token',
      severity,
      message: `Design token ${def.name} is defined but never used. Consider removing it to keep your design system clean.`,
      file: def.file,
      line: def.line,
      column: def.column,
    }));
}
