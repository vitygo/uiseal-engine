import type { TSESTree } from '@typescript-eslint/types';
import type { Rule, RuleContext } from './types.js';
import { extractArbitraryValues } from '../tailwind/parse-classes.js';
import type { TailwindArbitraryValue } from '../tailwind/parse-classes.js';

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

export const noTailwindArbitrary: Rule = {
  id: 'no-tailwind-arbitrary',
  category: 'design',
  defaultSeverity: 'warning',

  checkJsxNode(node: TSESTree.Node, ctx: RuleContext): void {
    if (node.type !== 'JSXAttribute') return;
    const attr = node as TSESTree.JSXAttribute;
    const attrName = attr.name.type === 'JSXIdentifier' ? attr.name.name : null;
    if (attrName !== 'className' && attrName !== 'class') return;

    for (const seg of collectClassSegments(attr)) {
      for (const av of extractArbitraryValues(seg.text)) {
        if (av.category === 'other') continue;
        if (isAllowed(av, ctx.config)) continue;

        const valueDescription =
          av.category === 'color' ? av.rawValue : `${av.designValue.value}px`;

        ctx.report({
          ruleId: 'no-tailwind-arbitrary',
          message: `Arbitrary Tailwind value '${av.className}' — ${valueDescription} is not in your ${categoryLabel(av.category)}.`,
          line: seg.line,
          column: seg.column,
        });
      }
    }
  },
};
