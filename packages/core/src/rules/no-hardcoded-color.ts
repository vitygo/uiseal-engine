import type { Declaration, AtRule } from 'postcss';
import type { TSESTree } from '@typescript-eslint/types';
import type { Rule, RuleContext } from './types.js';
import { parseValue } from '../values/parse-value.js';

// CSS properties that carry color values.
const COLOR_PROP_RE =
  /^(color|background(-color|-image|-gradient|-attachment|-clip|-origin|-position|-repeat|-size)?|border(-top|-right|-bottom|-left)?(-color)?|fill|stroke|outline(-color|-style|-width|-offset)?)$/;

function isColorProp(prop: string): boolean {
  return COLOR_PROP_RE.test(prop);
}

// SCSS ($x) / LESS (@x) variable definitions aren't real CSS properties, so
// their name never matches COLOR_PROP_RE. We still want to catch a hardcoded
// hex in the definition itself (usages are skipped via parseValue's isToken).
function isVariableDefinitionProp(prop: string): boolean {
  return /^[$@]/.test(prop);
}

function checkAndReport(
  prop: string,
  value: string,
  line: number,
  column: number,
  ctx: RuleContext,
): void {
  if (!isColorProp(prop) && !isVariableDefinitionProp(prop)) return;
  const parsed = parseValue(value, prop);
  if (parsed.kind !== 'color') return;
  if (parsed.isToken) return;

  const closest = ctx.helpers.findClosestColorToken(value, ctx.config);
  if (closest !== null) {
    ctx.report({
      ruleId: 'no-hardcoded-color',
      message: `Hardcoded color "${value}" in "${prop}". Did you mean var(${closest})?`,
      line,
      column,
      fix: { suggested: `var(${closest})` },
    });
  } else {
    ctx.report({
      ruleId: 'no-hardcoded-color',
      message: `Hardcoded color "${value}" in "${prop}". Replace with a design token.`,
      line,
      column,
    });
  }
}

export const noHardcodedColor: Rule = {
  id: 'no-hardcoded-color',
  category: 'design',
  defaultSeverity: 'error',

  checkCssDeclaration(decl: Declaration, ctx: RuleContext): void {
    checkAndReport(
      decl.prop,
      decl.value,
      decl.source?.start?.line ?? 1,
      decl.source?.start?.column ?? 0,
      ctx,
    );
  },

  // LESS parses top-level `@name: value;` variable definitions as AtRule
  // nodes, not Declarations — postcss-less preserves the literal ':' in
  // raws.afterName, which real at-rules (@media, @import, …) never have.
  checkCssAtRule(atRule: AtRule, ctx: RuleContext): void {
    if (!atRule.raws.afterName?.includes(':')) return;
    checkAndReport(
      `@${atRule.name}`,
      atRule.params,
      atRule.source?.start?.line ?? 1,
      atRule.source?.start?.column ?? 0,
      ctx,
    );
  },

  // Catches JSX color-ish props like <Button color="#ff0000" />.
  // The style={} case is handled upstream by extractInlineStyleDecls → checkCssDeclaration.
  checkJsxNode(node: TSESTree.Node, ctx: RuleContext): void {
    if (node.type !== 'JSXAttribute') return;
    const attr = node as TSESTree.JSXAttribute;
    const rawName =
      attr.name.type === 'JSXIdentifier' ? attr.name.name : null;
    if (!rawName || rawName === 'style') return;

    const cssProp = rawName.replace(/([A-Z])/g, '-$1').toLowerCase();
    if (!isColorProp(cssProp)) return;

    const value = extractAttrStringValue(attr);
    if (value === null) return;

    const loc = attr.loc?.start ?? { line: 1, column: 0 };
    checkAndReport(cssProp, value, loc.line, loc.column, ctx);
  },
};

function extractAttrStringValue(attr: TSESTree.JSXAttribute): string | null {
  const v = attr.value;
  if (!v) return null;
  if (v.type === 'Literal' && typeof v.value === 'string') return v.value;
  if (v.type === 'JSXExpressionContainer') {
    const e = v.expression;
    if (e.type === 'Literal' && typeof e.value === 'string') return e.value;
    if (e.type === 'TemplateLiteral' && e.quasis.length === 1) {
      return e.quasis[0]!.value.cooked ?? null;
    }
  }
  return null;
}
