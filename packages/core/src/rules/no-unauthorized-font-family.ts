import type { Declaration } from 'postcss';
import type { Rule, RuleContext } from './types.js';

export const noUnauthorizedFontFamily: Rule = {
  id: 'no-unauthorized-font-family',
  category: 'design',
  defaultSeverity: 'error',

  checkCssDeclaration(decl: Declaration, ctx: RuleContext): void {
    if (decl.prop !== 'font-family') return;

    const value = decl.value.trim();
    if (/^var\s*\(--/.test(value)) return;

    const firstFamily = extractFirstFamily(value);
    if (firstFamily === null) return;

    const normalized = firstFamily.toLowerCase();
    const allowed = ctx.config.tokens.fontFamilies.some(
      (f) => f.toLowerCase() === normalized,
    );

    if (!allowed) {
      ctx.report({
        ruleId: 'no-unauthorized-font-family',
        message: `Font family "${firstFamily}" is not in the authorized list.`,
        line: decl.source?.start?.line ?? 1,
        column: decl.source?.start?.column ?? 0,
      });
    }
  },
};

// Splits by comma, takes first entry, strips surrounding quotes and whitespace.
function extractFirstFamily(value: string): string | null {
  const first = value.split(',')[0];
  if (!first) return null;
  return first.trim().replace(/^['"]|['"]$/g, '');
}
