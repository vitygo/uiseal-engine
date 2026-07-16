import type { TSESTree } from '@typescript-eslint/types';
import type { Rule, RuleContext } from './types.js';
import { extractArbitraryValues } from '../tailwind/parse-classes.js';
import type { TailwindArbitraryValue } from '../tailwind/parse-classes.js';
import { findNearestNumeric } from '../values/nearest-token.js';

// Same thresholds the corresponding non-Tailwind rules use, for consistency:
// spacing-near-token.ts (4), no-arbitrary-font-size.ts / no-arbitrary-radius.ts (2).
const SPACING_THRESHOLD = 4;
const FONT_SIZE_THRESHOLD = 2;
const RADIUS_THRESHOLD = 2;

interface ClassSegment {
  text: string;
  line: number;
  column: number;
}

// Only what's statically analyzable is read; everything else (identifiers,
// ternaries, member expressions, spreads, non-'+' binary expressions, nested
// calls) is silently skipped rather than guessed at.
function collectFromExpression(expr: TSESTree.Node): ClassSegment[] {
  if (expr.type === 'Literal' && typeof expr.value === 'string') {
    return [{ text: expr.value, line: expr.loc.start.line, column: expr.loc.start.column }];
  }
  if (expr.type === 'TemplateLiteral') {
    // Only the static quasis are read; ${expression} parts are skipped —
    // this is what lets `className={\`px-4 ${dynamic} mt-[13px]\`}` still
    // catch mt-[13px] without ever touching `dynamic`.
    return expr.quasis
      .filter((q) => q.value.cooked)
      .map((q) => ({ text: q.value.cooked!, line: q.loc.start.line, column: q.loc.start.column }));
  }
  if (expr.type === 'CallExpression') {
    // cn('px-4', condition && 'mt-2', 'mt-[13px]') — only direct string
    // literal arguments; a LogicalExpression argument like the middle one
    // above is not evaluated, just skipped.
    return expr.arguments.flatMap((arg) => collectFromExpression(arg));
  }
  if (expr.type === 'BinaryExpression' && expr.operator === '+') {
    return [...collectFromExpression(expr.left), ...collectFromExpression(expr.right)];
  }
  return [];
}

function collectClassSegments(attr: TSESTree.JSXAttribute): ClassSegment[] {
  const v = attr.value;
  if (!v) return [];
  if (v.type === 'Literal' && typeof v.value === 'string') {
    return [{ text: v.value, line: v.loc.start.line, column: v.loc.start.column }];
  }
  if (v.type === 'JSXExpressionContainer') {
    return collectFromExpression(v.expression);
  }
  return [];
}

function isAllowed(av: TailwindArbitraryValue, config: RuleContext['config']): boolean {
  const value = av.designValue.value;

  switch (av.category) {
    case 'spacing':
      return value !== null && config.tokens.spacing.includes(value);
    case 'fontSize':
      return value !== null && config.tokens.fontSizes.includes(value);
    case 'radius':
      return value !== null && config.tokens.radii.includes(value);
    case 'color':
      return Object.values(config.tokens.colors).some(
        (tokenHex) => tokenHex.toLowerCase() === av.rawValue.trim().toLowerCase(),
      );
    case 'other':
      return true; // not a checked category — never a violation
  }
}

// Approach A (see report / commit message): suggest the nearest ON-TOKEN
// raw value, substituted back into the class's own bracket syntax, rather
// than resolving to the Tailwind utility name that value would correspond
// to (e.g. px-3) — that reverse mapping needs the Tailwind config loaded at
// check-time, not just at init-time (a token source only runs at init).
// This still fixes the actual problem (the value becomes on-scale) even
// though the result (px-[12px]) is still written as an arbitrary class.
//
// Replaces only the VALUE portion inside the brackets, so it works for both
// the utility form (px-[13px] -> px-[12px]) and the arbitrary-property form
// ([padding:13px] -> [padding:12px]) — variant/important/negative-sign
// prefixes outside the brackets are left untouched either way.
function buildFixedClassName(className: string, newInnerValue: string): string | null {
  const bracketMatch = className.match(/\[([^\]]*)\]/);
  if (!bracketMatch || bracketMatch.index === undefined) return null;

  const inner = bracketMatch[1] ?? '';
  const colonIdx = inner.indexOf(':');
  const newInner = colonIdx === -1 ? newInnerValue : `${inner.slice(0, colonIdx + 1)}${newInnerValue}`;

  const start = bracketMatch.index;
  const end = start + bracketMatch[0].length;
  return `${className.slice(0, start)}[${newInner}]${className.slice(end)}`;
}

function computeFix(av: TailwindArbitraryValue, ctx: RuleContext): string | null {
  if (av.category === 'color') {
    const closest = ctx.helpers.findClosestColorToken(av.rawValue, ctx.config);
    if (closest === null) return null;
    const hex = ctx.config.tokens.colors[closest];
    if (!hex) return null;
    return buildFixedClassName(av.className, hex);
  }

  const value = av.designValue.value;
  if (value === null) return null;

  const scale =
    av.category === 'spacing'
      ? ctx.config.tokens.spacing
      : av.category === 'fontSize'
        ? ctx.config.tokens.fontSizes
        : av.category === 'radius'
          ? ctx.config.tokens.radii
          : null;
  if (scale === null) return null;

  const threshold =
    av.category === 'spacing' ? SPACING_THRESHOLD : av.category === 'fontSize' ? FONT_SIZE_THRESHOLD : RADIUS_THRESHOLD;

  const nearest = findNearestNumeric(value, scale, { threshold });
  if (!nearest || !nearest.withinThreshold) return null;

  return buildFixedClassName(av.className, `${nearest.value}px`);
}

// A segment's own (line, column) marks where its text STARTS — but a
// className string literal can itself span multiple physical lines (JSX
// attribute strings preserve embedded newlines literally, unlike JSX text
// children), so a class appearing after an embedded '\n' is actually on a
// later line than the segment's start. Counting newlines up to the class's
// startIndex within the segment gives its real position.
function offsetToPosition(
  text: string,
  offset: number,
  base: { line: number; column: number },
): { line: number; column: number } {
  let line = base.line;
  let column = base.column;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') {
      line++;
      column = 0;
    } else {
      column++;
    }
  }
  return { line, column };
}

function categoryLabel(category: TailwindArbitraryValue['category']): string {
  switch (category) {
    case 'spacing':
      return 'spacing scale';
    case 'fontSize':
      return 'font-size scale';
    case 'radius':
      return 'radius scale';
    case 'color':
      return 'color tokens';
    case 'other':
      return '';
  }
}

/**
 * Runs the detection/fix logic against one class-string segment, reporting
 * through the given RuleContext. Framework-agnostic — RuleContext only
 * needs config/helpers/report, nothing JSX-specific — so this is exactly
 * what a Vue-template walker (or any future non-JSX source) reuses instead
 * of reimplementing arbitrary-value checking. Only `basePos` is trusted as
 * absolute; `startIndex` positions within `text` are resolved against it by
 * counting embedded newlines (see offsetToPosition).
 */
export function checkClassStringForArbitraryValues(
  text: string,
  basePos: { line: number; column: number },
  ctx: RuleContext,
): void {
  for (const av of extractArbitraryValues(text)) {
    if (av.category === 'other') continue;
    if (isAllowed(av, ctx.config)) continue;

    const valueDescription = av.category === 'color' ? av.rawValue : `${av.designValue.value}px`;
    const fix = computeFix(av, ctx);
    const pos = offsetToPosition(text, av.startIndex, basePos);

    ctx.report({
      ruleId: 'no-tailwind-arbitrary',
      message:
        fix !== null
          ? `Arbitrary Tailwind value '${av.className}' — ${valueDescription} is not in your ${categoryLabel(av.category)}. Did you mean '${fix}'?`
          : `Arbitrary Tailwind value '${av.className}' — ${valueDescription} is not in your ${categoryLabel(av.category)}.`,
      line: pos.line,
      column: pos.column,
      oldValue: av.className,
      ...(fix !== null ? { fix: { suggested: fix } } : {}),
    });
  }
}

export const noTailwindArbitrary: Rule = {
  id: 'no-tailwind-arbitrary',
  category: 'design',
  defaultSeverity: 'warning',
  shortDescription: 'Disallow Tailwind arbitrary values outside the token scale',
  fullDescription:
    "Flags Tailwind's square-bracket arbitrary-value syntax (e.g. px-[13px], text-[#ff5733]) when the value is not an exact match in the configured token scale; standard utility classes are never flagged. Catches the same design drift as no-hardcoded-color and no-arbitrary-spacing, but for Tailwind's escape hatch specifically.",
  helpUri: 'https://uiseal.io/docs/rules/no-tailwind-arbitrary',

  checkJsxNode(node: TSESTree.Node, ctx: RuleContext): void {
    if (node.type !== 'JSXAttribute') return;
    const attr = node as TSESTree.JSXAttribute;
    const attrName = attr.name.type === 'JSXIdentifier' ? attr.name.name : null;
    if (attrName !== 'className' && attrName !== 'class') return;

    for (const seg of collectClassSegments(attr)) {
      checkClassStringForArbitraryValues(seg.text, { line: seg.line, column: seg.column }, ctx);
    }
  },
};
