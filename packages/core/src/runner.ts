import micromatch from 'micromatch';
import type { Declaration, Comment, Root, AtRule } from 'postcss';
import type { TSESTree } from '@typescript-eslint/types';
import type { uisealConfig } from './config/schema.js';
import type { Violation } from './types.js';
import type { Rule, RuleContext, Severity } from './rules/types.js';
import { getParserForFile, type ParsedFile } from './parsers/registry.js';
import type { VueParsedFile } from './parsers/vue.js';
import type { AngularParsedFile } from './parsers/angular.js';
import type { SvelteParsedFile } from './parsers/svelte.js';
import {
  walkSvelteTemplate,
  extractSvelteInlineStyleDecls,
  extractSvelteClassSegments,
} from './svelte/template-adapter.js';
import { extractAngularInlineStyleDecls, extractAngularClassSegments } from './angular/template-adapter.js';
import { objectExpressionToDecls } from './adapters/object-expr-to-decls.js';
import { walkVueTemplate, extractVueInlineStyleDecls, extractVueClassSegments } from './vue/template-adapter.js';
import { checkClassStringForArbitraryValues } from './rules/no-tailwind-arbitrary.js';
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
    if (!parser) continue;

    let parsed: ParsedFile;
    try {
      parsed = parser.parse(code, filePath);
    } catch (err) {
      violations.push({
        ruleId: 'parse-error',
        severity: 'warning',
        message: `Failed to parse file: ${err instanceof Error ? err.message : String(err)}`,
        file: filePath,
        line: 1,
        column: 1,
      });
      continue;
    }

    if (parsed.kind === 'css') {
      violations.push(...analyzeCss(filePath, code, parsed.root, config, rules, definedTokens, usedVarRefs, spacingUsages));
    } else if (parsed.kind === 'jsx') {
      violations.push(...analyzeJsx(filePath, code, parsed.ast, config, rules, usedVarRefs));
    } else if (parsed.kind === 'vue') {
      violations.push(...analyzeVue(filePath, parsed, config, rules, definedTokens, usedVarRefs, spacingUsages));
    } else if (parsed.kind === 'angular') {
      if (!parsed.isComponent) continue; // not an Angular component — nothing to check
      violations.push(...analyzeAngular(filePath, parsed, config, rules, definedTokens, usedVarRefs, spacingUsages));
    } else if (parsed.kind === 'svelte') {
      violations.push(...analyzeSvelte(filePath, parsed, config, rules, definedTokens, usedVarRefs, spacingUsages));
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
  root: Root,
  config: uisealConfig,
  rules: Rule[],
  definedTokens: TokenDef[],
  usedVarRefs: Set<string>,
  spacingUsages: SpacingUsage[],
): Violation[] {
  const violations: Violation[] = [];

  const cssRules = rules.filter((r) => r.checkCssDeclaration !== undefined);
  const cssCommentRules = rules.filter((r) => r.checkCssComment !== undefined);
  const cssAtRuleRules = rules.filter((r) => r.checkCssAtRule !== undefined);

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

  // LESS `@name: value;` variable definitions parse as AtRule nodes (not
  // Declarations) — this hook lets rules like no-hardcoded-color inspect them.
  if (cssAtRuleRules.length > 0) {
    root.walkAtRules((atRule: AtRule) => {
      for (const rule of cssAtRuleRules) {
        const sev = effectiveSeverity(rule, config);
        if (sev === 'off') continue;
        const ctx = makeContext(filePath, config, violations, sev);
        rule.checkCssAtRule!(atRule, ctx);
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

// Runs the exact same CSS rule-walking as analyzeCss() on each <style>
// block's already-parsed Root — reused, not reimplemented, so ignore-comment
// handling (buildCssIgnoreMap), checkCssComment/checkCssAtRule support, and
// post-analysis collection (dead-token defs, spacing usages) all come along
// for free. postcss parses each block's content in isolation starting at
// line 1, so every line number analyzeCss produces — on violations AND on
// the TokenDef/SpacingUsage entries it feeds into post-analysis — is offset
// back to the true .vue file line afterward.
function analyzeVue(
  filePath: string,
  parsed: VueParsedFile,
  config: uisealConfig,
  rules: Rule[],
  definedTokens: TokenDef[],
  usedVarRefs: Set<string>,
  spacingUsages: SpacingUsage[],
): Violation[] {
  const violations: Violation[] = [];

  for (const style of parsed.styles) {
    const tokensBefore = definedTokens.length;
    const spacingBefore = spacingUsages.length;

    const styleViolations = analyzeCss(
      filePath,
      style.content,
      style.root,
      config,
      rules,
      definedTokens,
      usedVarRefs,
      spacingUsages,
    );

    for (const v of styleViolations) v.line += style.offset;
    for (let i = tokensBefore; i < definedTokens.length; i++) definedTokens[i]!.line += style.offset;
    for (let i = spacingBefore; i < spacingUsages.length; i++) spacingUsages[i]!.line += style.offset;

    violations.push(...styleViolations);
  }

  // Template: :style / style="..." inline styles feed CSS rules via the
  // same adapter pattern as JSX's style={{}} — template positions are
  // already absolute (see parsers/vue.ts), so no offset is needed here.
  //
  // Tailwind class/:class checking reuses no-tailwind-arbitrary's own
  // detection+fix logic directly (checkClassStringForArbitraryValues) rather
  // than going through the Rule/checkJsxNode dispatch — Vue template nodes
  // aren't TSESTree, so there's no checkJsxNode hook to call here (per the
  // architecture decision: Vue templates get their own walker). It only
  // runs when the caller actually included the rule, so `rules: [x]`
  // continues to mean exactly what it says for Vue files too.
  if (parsed.template) {
    const cssRules = rules.filter((r) => r.checkCssDeclaration !== undefined);
    const tailwindRule = rules.find((r) => r.id === 'no-tailwind-arbitrary');
    const tailwindSeverity = tailwindRule ? effectiveSeverity(tailwindRule, config) : 'off';

    walkVueTemplate(parsed.template.ast, (node) => {
      const inlineDecls = extractVueInlineStyleDecls(node);
      for (const decl of inlineDecls) {
        for (const rule of cssRules) {
          const sev = effectiveSeverity(rule, config);
          if (sev === 'off') continue;
          const ctx = makeContext(filePath, config, violations, sev);
          rule.checkCssDeclaration!(decl, ctx);
        }
        for (const name of extractVarRefs(decl.value)) usedVarRefs.add(name);
      }

      if (tailwindSeverity !== 'off') {
        const ctx = makeContext(filePath, config, violations, tailwindSeverity);
        for (const seg of extractVueClassSegments(node)) {
          checkClassStringForArbitraryValues(seg.text, { line: seg.line, column: seg.column }, ctx);
        }
      }
    });
  }

  return violations;
}

// Runs the same CSS rule-walking as analyzeCss() on each inline `styles`
// entry from a @Component decorator — identical pattern to analyzeVue's
// style blocks (Commit 2 of the Vue feature): postcss parses each string in
// isolation starting at line 1, so the offset (the template literal's own
// start line - 1) is added back to every reported line afterward, on both
// violations and the TokenDef/SpacingUsage entries fed into post-analysis.
function analyzeAngular(
  filePath: string,
  parsed: AngularParsedFile,
  config: uisealConfig,
  rules: Rule[],
  definedTokens: TokenDef[],
  usedVarRefs: Set<string>,
  spacingUsages: SpacingUsage[],
): Violation[] {
  const violations: Violation[] = [];

  for (const style of parsed.styles) {
    const tokensBefore = definedTokens.length;
    const spacingBefore = spacingUsages.length;

    const styleViolations = analyzeCss(
      filePath,
      style.content,
      style.root,
      config,
      rules,
      definedTokens,
      usedVarRefs,
      spacingUsages,
    );

    for (const v of styleViolations) v.line += style.offset;
    for (let i = tokensBefore; i < definedTokens.length; i++) definedTokens[i]!.line += style.offset;
    for (let i = spacingBefore; i < spacingUsages.length; i++) spacingUsages[i]!.line += style.offset;

    violations.push(...styleViolations);
  }

  // Template: inline styles ([ngStyle], [style.X.unit], static style=...) and
  // Tailwind classes (class=, [class], [ngClass]) both come from a regex
  // tag/attribute scan (angular/template-scanner.ts), not an AST — Angular
  // templates aren't JSX or a compiler-provided AST like Vue's. Every
  // position the scanner reports is relative to the template STRING it was
  // given (line 1 = the string's own first line), so parsed.template.offset
  // is added back — 0 for an external .component.html (the whole file IS
  // the template, already absolute), the inline template literal's start
  // line - 1 otherwise (same formula as style blocks, just for template).
  if (parsed.template) {
    const { content, offset } = parsed.template;
    const cssRules = rules.filter((r) => r.checkCssDeclaration !== undefined);
    const tailwindRule = rules.find((r) => r.id === 'no-tailwind-arbitrary');
    const tailwindSeverity = tailwindRule ? effectiveSeverity(tailwindRule, config) : 'off';

    const beforeCss = violations.length;
    for (const decl of extractAngularInlineStyleDecls(content)) {
      for (const rule of cssRules) {
        const sev = effectiveSeverity(rule, config);
        if (sev === 'off') continue;
        const ctx = makeContext(filePath, config, violations, sev);
        rule.checkCssDeclaration!(decl, ctx);
      }
      for (const name of extractVarRefs(decl.value)) usedVarRefs.add(name);
    }
    for (let i = beforeCss; i < violations.length; i++) violations[i]!.line += offset;

    if (tailwindSeverity !== 'off') {
      const ctx = makeContext(filePath, config, violations, tailwindSeverity);
      for (const seg of extractAngularClassSegments(content)) {
        checkClassStringForArbitraryValues(seg.text, { line: seg.line + offset, column: seg.column }, ctx);
      }
    }
  }

  return violations;
}

// Runs the same CSS rule-walking as analyzeCss() on the <style> block —
// identical pattern to Vue/Angular's style blocks: postcss parses the
// content in isolation starting at line 1, so the offset (computed in
// parsers/svelte.ts from the block's character offset) is added back to
// every reported line afterward, on both violations and the TokenDef/
// SpacingUsage entries fed into post-analysis.
function analyzeSvelte(
  filePath: string,
  parsed: SvelteParsedFile,
  config: uisealConfig,
  rules: Rule[],
  definedTokens: TokenDef[],
  usedVarRefs: Set<string>,
  spacingUsages: SpacingUsage[],
): Violation[] {
  const violations: Violation[] = [];

  for (const style of parsed.styles) {
    const tokensBefore = definedTokens.length;
    const spacingBefore = spacingUsages.length;

    const styleViolations = analyzeCss(
      filePath,
      style.content,
      style.root,
      config,
      rules,
      definedTokens,
      usedVarRefs,
      spacingUsages,
    );

    for (const v of styleViolations) v.line += style.offset;
    for (let i = tokensBefore; i < definedTokens.length; i++) definedTokens[i]!.line += style.offset;
    for (let i = spacingBefore; i < spacingUsages.length; i++) spacingUsages[i]!.line += style.offset;

    violations.push(...styleViolations);
  }

  // Template: style="..."/style:prop directives and class="..."/class:name
  // directives feed CSS rules / Tailwind checking directly — Svelte's own
  // AST gives every binding's own precise, already-absolute position (no
  // offset needed, and no shared-position simplification like Vue/Angular
  // needed either — see svelte/template-adapter.ts). Tailwind checking
  // only runs when the caller's rules array actually includes
  // no-tailwind-arbitrary, matching the same opt-in contract as Vue/Angular.
  if (parsed.template) {
    const cssRules = rules.filter((r) => r.checkCssDeclaration !== undefined);
    const tailwindRule = rules.find((r) => r.id === 'no-tailwind-arbitrary');
    const tailwindSeverity = tailwindRule ? effectiveSeverity(tailwindRule, config) : 'off';

    walkSvelteTemplate(parsed.template, (node) => {
      const inlineDecls = extractSvelteInlineStyleDecls(node);
      for (const decl of inlineDecls) {
        for (const rule of cssRules) {
          const sev = effectiveSeverity(rule, config);
          if (sev === 'off') continue;
          const ctx = makeContext(filePath, config, violations, sev);
          rule.checkCssDeclaration!(decl, ctx);
        }
        for (const name of extractVarRefs(decl.value)) usedVarRefs.add(name);
      }

      if (tailwindSeverity !== 'off') {
        const ctx = makeContext(filePath, config, violations, tailwindSeverity);
        for (const seg of extractSvelteClassSegments(node)) {
          checkClassStringForArbitraryValues(seg.text, { line: seg.line, column: seg.column }, ctx);
        }
      }
    });
  }

  return violations;
}

function analyzeJsx(
  filePath: string,
  code: string,
  ast: TSESTree.Program,
  config: uisealConfig,
  rules: Rule[],
  usedVarRefs: Set<string>,
): Violation[] {
  const violations: Violation[] = [];
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

  return objectExpressionToDecls(expr);
}
