import type { Declaration } from 'postcss';
import type { Rule, RuleContext } from './types.js';
import { parseValue, isVarToken } from '../values/parse-value.js';

export const noArbitraryRadius: Rule = {
  id: 'no-arbitrary-radius',
  category: 'design',
  defaultSeverity: 'warning',

  checkCssDeclaration(decl: Declaration, ctx: RuleContext): void {
    const RADIUS_PROPS = new Set([
      'border-radius',
      'border-top-left-radius',
      'border-top-right-radius',
      'border-bottom-left-radius',
      'border-bottom-right-radius',
    ]);
    if (!RADIUS_PROPS.has(decl.prop)) return;

    // Multi-value shorthand like "4px 8px" — check each part.
    // Slash syntax like "4px / 8px" separates horizontal/vertical radii.
    const parts = decl.value.trim().replace(/\//g, ' ').split(/\s+/);
    for (const part of parts) {
      if (!isAllowedPart(part, ctx)) {
        ctx.report({
          ruleId: 'no-arbitrary-radius',
          message: `Arbitrary ${decl.prop} value "${part}". Use a radius token.`,
          line: decl.source?.start?.line ?? 1,
          column: decl.source?.start?.column ?? 0,
        });
      }
    }
  },
};

function isAllowedPart(part: string, ctx: RuleContext): boolean {
  if (part === '0' || part === 'auto') return true;
  if (part.endsWith('%')) return true;
  if (isVarToken(part)) return true;
  if (/^calc\s*\(/.test(part)) return true;

  if (part.endsWith('px')) {
    const parsed = parseValue(part);
    return parsed.value !== null && ctx.helpers.isAllowedRadius(parsed.value, ctx.config);
  }

  // Any other unit-bearing value is not a radius token.
  return !hasUnit(part);
}

function hasUnit(part: string): boolean {
  return /^-?\d*\.?\d+(px|rem|em|vh|vw|vmin|vmax|ch|ex|cm|mm|in|pt|pc)$/.test(part);
}
