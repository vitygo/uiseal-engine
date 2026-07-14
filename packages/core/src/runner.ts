import micromatch from 'micromatch';
import type { Declaration, Comment } from 'postcss';
import type { TSESTree } from '@typescript-eslint/types';
import type { uisealConfig } from './config/schema.js';
import type { Violation } from './types.js';
import type { Rule, RuleContext, Severity } from './rules/types.js';
import { parseCss } from './parsers/css.js';
import { parseJsx } from './parsers/jsx.js';
import { getParserForFile } from './parsers/registry.js';
import { buildCssIgnoreMap, buildJsxIgnoreMap, applyIgnoreMap } from './ignore.js';
import { clearEnvInClientCache } from './rules/no-env-in-client.js';
import {
  findClosestColorToken,
  isAllowedSpacing,
  isAllowedFontSize,
  isAllowedRadius,
  isAllowedFontFamily,
} from './config/helpers.js';
import {
  collectDefinedTokens,
  extractVarRefs,
  analyzeDeadTokens,
  type TokenDef,
} from './analyzers/no-dead-token.js';
import {
  collectNonAllowedSpacingUsages,
  analyzeSpacingNearToken,
  type SpacingUsage,
} from './analyzers/spacing-near-token.js';
import { analyzeVariantSprawl } from './analyzers/variant-sprawl.js';
import { validateLicense } from './license/index.js';
import type { LicenseState } from './license/index.js';

export interface AnalyzeInput {
  files: Map<string, string>;
  config: uisealConfig;
  rules: Rule[];
  /** Project root directory for license cache lookup. Defaults to process.cwd(). */
  projectRoot?: string;
  /** Pre-validated license state; if provided, skips validateLicense() entirely. */
  licenseState?: LicenseState;
}

export interface AnalysisResult {
  violations: Violation[];
  licenseState: LicenseState;
}

const helpers = {
  findClosestColorToken,
  isAllowedSpacing,
  isAllowedFontSize,
  isAllowedRadius,
  isAllowedFontFamily,
};

export async function analyze({ files, config, rules, projectRoot, licenseState: providedLicenseState }: AnalyzeInput): Promise<AnalysisResult> {
  let licenseState: LicenseState;
  if (providedLicenseState !== undefined) {
    licenseState = providedLicenseState;
  } else {
    const token = process.env['UISEAL_TOKEN'] ?? null;
    const apiUrl = process.env['UISEAL_API_URL'] ?? 'https://api.uiseal.io';
    const root = projectRoot ?? process.cwd();
    licenseState = await validateLicense(token, apiUrl, root);
  }

  clearEnvInClientCache();
  const violations: Violation[] = [];

  // State collected across all files for post-analysis
  const definedTokens: TokenDef[] = [];
  const usedVarRefs = new Set<string>();
  const spacingUsages: SpacingUsage[] = [];

  for (const [filePath, code] of files) {
    if (config.ignore.length > 0 && micromatch.isMatch(filePath, config.ignore)) {
      continue;
    }

    const parser = getParserForFile(filePath);

    if (parser?.id === 'css') {
      violations.push(...analyzeCss(filePath, code, config, rules, definedTokens, usedVarRefs, spacingUsages));
    } else if (parser?.id === 'jsx') {
      violations.push(...analyzeJsx(filePath, code, config, rules, usedVarRefs));
    }
  }

  // Post-analysis: dead design tokens
  violations.push(...analyzeDeadTokens(definedTokens, usedVarRefs, config));

  // Post-analysis: spacing near token (refines no-arbitrary-spacing)
  const { violations: nearTokenViolations, suppressKeys } = analyzeSpacingNearToken(spacingUsages, config);
  if (suppressKeys.size > 0) {
    // Remove no-arbitrary-spacing violations that spacing-near-token supersedes
    const toRemove = new Set<number>();
    violations.forEach((v, i) => {
      if (v.ruleId !== 'no-arbitrary-spacing') return;
      const m = /"([^"]+)"/.exec(v.message);
      if (!m) return;
      const key = `${v.file}|${v.line}|${v.column}|${m[1]}`;
      if (suppressKeys.has(key)) toRemove.add(i);
    });
    for (let i = violations.length - 1; i >= 0; i--) {
      if (toRemove.has(i)) violations.splice(i, 1);
    }
  }
  violations.push(...nearTokenViolations);

  // Post-analysis: variant sprawl (Team+ tier only)
  if (licenseState.plan !== 'free') {
    const sprawlResult = analyzeVariantSprawl(files, config);
    if (!Array.isArray(sprawlResult)) {
      process.stderr.write('[uiseal] Warning: variant-sprawl returned a non-array; skipping.\n');
    } else {
      violations.push(...sprawlResult);
    }
  }

  return { violations, licenseState };
}

function effectiveSeverity(rule: Rule, config: uisealConfig): Severity | 'off' {
  const override = config.rules[rule.id];
  if (override !== undefined) {
    if (override === 'off') return 'off';
    // Config uses 'warn'; Violation.severity uses 'warning'.
    return override === 'warn' ? 'warning' : 'error';
  }
  return rule.defaultSeverity;
}

function makeContext(
  filePath: string,
  config: uisealConfig,
  violations: Violation[],
  severity: Severity,
): RuleContext {
  return {
    config,
    currentFile: filePath,
    helpers,
    report(v) {
      violations.push({ ...v, file: filePath, severity });
    },
  };
}

function analyzeCss(
  filePath: string,
  code: string,
  config: uisealConfig,
  rules: Rule[],
  definedTokens: TokenDef[],
  usedVarRefs: Set<string>,
  spacingUsages: SpacingUsage[],
): Violation[] {
  const violations: Violation[] = [];
  let root;
  try {
    root = parseCss(code);
  } catch (err) {
    violations.push({
      ruleId: 'parse-error',
      severity: 'warning',
      message: `Failed to parse file: ${err instanceof Error ? err.message : String(err)}`,
      file: filePath,
      line: 1,
      column: 1,
    });
    return violations;
  }

  const cssRules = rules.filter((r) => r.checkCssDeclaration !== undefined);
  const cssCommentRules = rules.filter((r) => r.checkCssComment !== undefined);

  root.walkDecls((decl) => {
    for (const rule of cssRules) {
      const sev = effectiveSeverity(rule, config);
      if (sev === 'off') continue;
      const ctx = makeContext(filePath, config, violations, sev);
      rule.checkCssDeclaration!(decl, ctx);
    }
  });

  if (cssCommentRules.length > 0) {
    root.walkComments((comment: Comment) => {
      for (const rule of cssCommentRules) {
        const sev = effectiveSeverity(rule, config);
        if (sev === 'off') continue;
        const ctx = makeContext(filePath, config, violations, sev);
        rule.checkCssComment!(comment, ctx);
      }
    });
  }

  const ignoreMap = buildCssIgnoreMap(code, root);

  // Collect for post-analysis
  definedTokens.push(...collectDefinedTokens(filePath, root));
  root.walkDecls((decl) => {
    for (const name of extractVarRefs(decl.value)) usedVarRefs.add(name);
  });
  spacingUsages.push(...collectNonAllowedSpacingUsages(filePath, root, config));

  return applyIgnoreMap(violations, ignoreMap);
}

function analyzeJsx(
  filePath: string,
  code: string,
  config: uisealConfig,
  rules: Rule[],
  usedVarRefs: Set<string>,
): Violation[] {
  const violations: Violation[] = [];
  let ast;
  try {
    ast = parseJsx(code);
  } catch (err) {
    violations.push({
      ruleId: 'parse-error',
      severity: 'warning',
      message: `Failed to parse file: ${err instanceof Error ? err.message : String(err)}`,
      file: filePath,
      line: 1,
      column: 1,
    });
    return violations;
  }
  const jsxRules = rules.filter((r) => r.checkJsxNode !== undefined);
  const cssRules = rules.filter((r) => r.checkCssDeclaration !== undefined);

  walkAst(ast, (node) => {
    for (const rule of jsxRules) {
      const sev = effectiveSeverity(rule, config);
      if (sev === 'off') continue;
      const ctx = makeContext(filePath, config, violations, sev);
      rule.checkJsxNode!(node, ctx);
    }

    // Inline style={{ prop: value }} — feed css rules via adapter and collect var refs.
    const inlineDecls = extractInlineStyleDecls(node);
    for (const decl of inlineDecls) {
      for (const rule of cssRules) {
        const sev = effectiveSeverity(rule, config);
        if (sev === 'off') continue;
        const ctx = makeContext(filePath, config, violations, sev);
        rule.checkCssDeclaration!(decl, ctx);
      }
      for (const name of extractVarRefs(decl.value)) usedVarRefs.add(name);
    }
  });

  const ignoreMap = buildJsxIgnoreMap(code, ast);
  return applyIgnoreMap(violations, ignoreMap);
}

function walkAst(node: TSESTree.Node, visit: (node: TSESTree.Node) => void): void {
  visit(node);
  const record = node as unknown as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const child = record[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && 'type' in item) {
          walkAst(item as TSESTree.Node, visit);
        }
      }
    } else if (child && typeof child === 'object' && 'type' in child) {
      walkAst(child as TSESTree.Node, visit);
    }
  }
}

// Convert JSX inline style prop entries into postcss Declaration-like objects.
function extractInlineStyleDecls(node: TSESTree.Node): Declaration[] {
  // Match: <Comp style={{ ... }} /> where the JSXAttribute value is a
  // JSXExpressionContainer wrapping an ObjectExpression.
  if (node.type !== 'JSXAttribute') return [];
  const attr = node as TSESTree.JSXAttribute;
  if (
    !attr.name ||
    (attr.name.type === 'JSXIdentifier' && attr.name.name !== 'style')
  ) {
    return [];
  }
  if (!attr.value || attr.value.type !== 'JSXExpressionContainer') return [];
  const expr = attr.value.expression;
  if (expr.type !== 'ObjectExpression') return [];

  const decls: Declaration[] = [];
  for (const prop of expr.properties) {
    if (prop.type !== 'Property') continue;
    const p = prop as TSESTree.Property;
    const keyNode = p.key;
    const valueNode = p.value;

    const propName =
      keyNode.type === 'Identifier'
        ? keyNode.name
        : keyNode.type === 'Literal' && typeof keyNode.value === 'string'
          ? keyNode.value
          : null;
    if (!propName) continue;

    const propValue =
      valueNode.type === 'Literal' && valueNode.value !== null
        ? String(valueNode.value)
        : valueNode.type === 'TemplateLiteral' && valueNode.quasis.length === 1
          ? valueNode.quasis[0]!.value.cooked ?? ''
          : null;
    if (propValue === null) continue;

    // camelCase → kebab-case for CSS property name.
    const cssProperty = propName.replace(/([A-Z])/g, '-$1').toLowerCase();

    // Build a minimal postcss Declaration-compatible object.
    const loc = p.loc ?? { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } };
    const decl = {
      type: 'decl',
      prop: cssProperty,
      value: propValue,
      important: false,
      source: {
        start: { line: loc.start.line, column: loc.start.column, offset: 0 },
        end: { line: loc.end.line, column: loc.end.column, offset: 0 },
      },
    } as unknown as Declaration;

    decls.push(decl);
  }

  return decls;
}
