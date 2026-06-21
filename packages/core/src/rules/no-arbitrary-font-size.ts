import type { Declaration } from 'postcss';
import type { Rule, RuleContext } from './types.js';

export const noArbitraryFontSize: Rule = {
  id: 'no-arbitrary-font-size',
  category: 'design',
  defaultSeverity: 'error',

  checkCssDeclaration(decl: Declaration, ctx: RuleContext): void {
    if (decl.prop !== 'font-size') return;

    const value = decl.value.trim();
    if (/^var\s*\(--/.test(value)) return;

    if (value.endsWith('px')) {
      const num = parseFloat(value);
      if (!isNaN(num) && ctx.helpers.isAllowedFontSize(num, ctx.config)) return;
    }

    if (value.endsWith('rem')) {
      const num = parseFloat(value);
      if (!isNaN(num) && ctx.helpers.isAllowedFontSize(num * 16, ctx.config)) return;
    }

    ctx.report({
      ruleId: 'no-arbitrary-font-size',
      message: `Arbitrary font-size "${value}". Use a font-size token.`,
      line: decl.source?.start?.line ?? 1,
      column: decl.source?.start?.column ?? 0,
    });
  },
};
