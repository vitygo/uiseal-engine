import type { Declaration } from 'postcss';
import type { Rule, RuleContext } from './types.js';
import { parseValue, isVarToken } from '../values/parse-value.js';

export const noArbitraryFontSize: Rule = {
  id: 'no-arbitrary-font-size',
  category: 'design',
  defaultSeverity: 'error',

  checkCssDeclaration(decl: Declaration, ctx: RuleContext): void {
    if (decl.prop !== 'font-size') return;

    const value = decl.value.trim();
    if (isVarToken(value)) return;

    if (value.endsWith('px') || value.endsWith('rem')) {
      const parsed = parseValue(value);
      if (parsed.value !== null && ctx.helpers.isAllowedFontSize(parsed.value, ctx.config)) return;
    }

    ctx.report({
      ruleId: 'no-arbitrary-font-size',
      message: `Arbitrary font-size "${value}". Use a font-size token.`,
      line: decl.source?.start?.line ?? 1,
      column: decl.source?.start?.column ?? 0,
    });
  },
};
