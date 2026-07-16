import type { Declaration } from 'postcss';
import type { Rule, RuleContext } from './types.js';
import { isVarToken } from '../values/parse-value.js';

export const noUnauthorizedFontFamily: Rule = {
  id: 'no-unauthorized-font-family',
  category: 'design',
  defaultSeverity: 'error',
  shortDescription: 'Disallow font families outside the approved list',
  fullDescription:
    'Flags a font-family declaration whose first family name is not in the configured list of approved fonts. Prevents an unapproved font from silently entering the codebase via a copy-pasted snippet or a third-party component.',
  helpUri: 'https://uiseal.io/docs/rules/no-unauthorized-font-family',

  checkCssDeclaration(decl: Declaration, ctx: RuleContext): void {
    if (decl.prop !== 'font-family') return;

    const value = decl.value.trim();
    if (isVarToken(value)) return;

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
