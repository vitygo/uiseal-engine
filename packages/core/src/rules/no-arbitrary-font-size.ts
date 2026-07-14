import type { Declaration } from 'postcss';
import type { Rule, RuleContext } from './types.js';
import { parseValue, isVarToken } from '../values/parse-value.js';
import { findNearestNumeric } from '../values/nearest-token.js';

// Font-size scales are denser than spacing at the low end (e.g. 12/14/16px —
// 2px apart), so reusing spacing's 4px threshold would let 14px round to a
// suggestion of 16px or 12px indiscriminately. 2px keeps suggestions to
// genuine near-misses without blurring adjacent real sizes together.
const FONT_SIZE_NEAR_MISS_THRESHOLD = 2;

export const noArbitraryFontSize: Rule = {
  id: 'no-arbitrary-font-size',
  category: 'design',
  defaultSeverity: 'error',

  checkCssDeclaration(decl: Declaration, ctx: RuleContext): void {
    if (decl.prop !== 'font-size') return;

    const value = decl.value.trim();
    if (isVarToken(value)) return;

    let parsedPx: number | null = null;
    if (value.endsWith('px') || value.endsWith('rem')) {
      const parsed = parseValue(value);
      if (parsed.value !== null) {
        if (ctx.helpers.isAllowedFontSize(parsed.value, ctx.config)) return;
        parsedPx = parsed.value;
      }
    }

    const nearest =
      parsedPx !== null
        ? findNearestNumeric(parsedPx, ctx.config.tokens.fontSizes, {
            threshold: FONT_SIZE_NEAR_MISS_THRESHOLD,
          })
        : null;
    const suggestion = nearest && nearest.withinThreshold ? nearest.value : null;

    ctx.report({
      ruleId: 'no-arbitrary-font-size',
      message:
        suggestion !== null
          ? `Arbitrary font-size "${value}". Did you mean ${suggestion}px? Use a font-size token.`
          : `Arbitrary font-size "${value}". Use a font-size token.`,
      line: decl.source?.start?.line ?? 1,
      column: decl.source?.start?.column ?? 0,
      ...(suggestion !== null ? { fix: { suggested: `${suggestion}px` } } : {}),
    });
  },
};
