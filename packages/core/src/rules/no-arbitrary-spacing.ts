import type { Declaration } from 'postcss';
import type { Rule, RuleContext } from './types.js';
import { parseValue } from '../values/parse-value.js';

const SPACING_PROP_RE =
  /^(margin(-top|-right|-bottom|-left)?|padding(-top|-right|-bottom|-left)?|gap|row-gap|column-gap|top|left|right|bottom)$/;

export const noArbitrarySpacing: Rule = {
  id: 'no-arbitrary-spacing',
  category: 'design',
  defaultSeverity: 'error',

  checkCssDeclaration(decl: Declaration, ctx: RuleContext): void {
    if (!SPACING_PROP_RE.test(decl.prop)) return;

    const parts = decl.value.trim().split(/\s+/);
    for (const part of parts) {
      if (!isAllowedPart(part, ctx)) {
        ctx.report({
          ruleId: 'no-arbitrary-spacing',
          message: `Arbitrary spacing value "${part}" in "${decl.prop}". Use a spacing token.`,
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
  if (/^var\s*\(--/.test(part)) return true;
  // calc() and env() are dynamic — leave them alone.
  if (/^calc\s*\(|^env\s*\(/.test(part)) return true;

  if (part.endsWith('px') || part.endsWith('rem')) {
    const parsed = parseValue(part);
    return parsed.value !== null && ctx.helpers.isAllowedSpacing(parsed.value, ctx.config);
  }

  // Any other unit-bearing value (em, vh, …) is not a spacing token.
  return !hasUnit(part);
}

function hasUnit(part: string): boolean {
  return /^-?\d*\.?\d+(px|rem|em|vh|vw|vmin|vmax|ch|ex|cm|mm|in|pt|pc)$/.test(part);
}
