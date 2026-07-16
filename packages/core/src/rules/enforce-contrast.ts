import { parse, wcagContrast } from 'culori';
import type { Declaration } from 'postcss';
import type { Rule, RuleContext } from './types.js';

const WCAG_THRESHOLDS = { AA: 4.5, AAA: 7 } as const;

export const enforceContrast: Rule = {
  id: 'enforce-contrast',
  category: 'design',
  defaultSeverity: 'error',
  shortDescription: 'Disallow color/background pairs that fail WCAG contrast',
  fullDescription:
    'Computes the contrast ratio between a color declaration and its same-block background-color sibling, flagging pairs below the configured WCAG level\'s minimum ratio. Only same-block pairs are checked, so this is a best-effort static check, not a substitute for a full accessibility audit.',
  helpUri: 'https://uiseal.io/docs/rules/enforce-contrast',

  // Only fires when processing a `color` declaration; we then look for a
  // background sibling in the same block. This ensures each pair is checked
  // exactly once and we never report on the background declaration itself.
  checkCssDeclaration(decl: Declaration, ctx: RuleContext): void {
    if (decl.prop !== 'color') return;

    const fgParsed = parse(decl.value.trim());
    if (!fgParsed) return; // not a concrete, parseable color

    const parent = decl.parent;
    if (!parent || !('nodes' in parent)) return;

    // Find the first background-color or background sibling with a concrete value.
    let bgValue: string | null = null;
    for (const node of (parent as { nodes: unknown[] }).nodes) {
      if (
        node != null &&
        typeof node === 'object' &&
        'type' in node &&
        (node as { type: string }).type === 'decl'
      ) {
        const d = node as Declaration;
        if (d.prop === 'background-color' || d.prop === 'background') {
          const parsed = parse(d.value.trim());
          if (parsed) {
            bgValue = d.value.trim();
            break;
          }
        }
      }
    }

    if (bgValue === null) return;

    const bgParsed = parse(bgValue)!;
    const ratio = wcagContrast(fgParsed, bgParsed);
    const level = ctx.config.wcag?.level ?? 'AA';
    const threshold = WCAG_THRESHOLDS[level];

    if (ratio < threshold) {
      ctx.report({
        ruleId: 'enforce-contrast',
        message:
          `Contrast ratio ${ratio.toFixed(2)}:1 between "${decl.value.trim()}" and "${bgValue}" ` +
          `is below WCAG ${level} (${threshold}:1). ` +
          `Note: only same-block color/background pairs are checked.`,
        line: decl.source?.start?.line ?? 1,
        column: decl.source?.start?.column ?? 0,
      });
    }
  },
};
