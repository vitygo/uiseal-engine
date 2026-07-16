import type { Declaration, Comment, AtRule } from 'postcss';
import type { TSESTree } from '@typescript-eslint/types';
import type { uisealConfig } from '../config/schema.js';
import type { Violation } from '../types.js';
import type {
  findClosestColorToken,
  isAllowedSpacing,
  isAllowedFontSize,
  isAllowedRadius,
  isAllowedFontFamily,
} from '../config/helpers.js';

export type Severity = 'error' | 'warning';

export interface RuleContext {
  config: uisealConfig;
  currentFile: string;
  helpers: {
    findClosestColorToken: typeof findClosestColorToken;
    isAllowedSpacing: typeof isAllowedSpacing;
    isAllowedFontSize: typeof isAllowedFontSize;
    isAllowedRadius: typeof isAllowedRadius;
    isAllowedFontFamily: typeof isAllowedFontFamily;
  };
  report(violation: Omit<Violation, 'file' | 'severity'>): void;
}

// Shared by Rule (the 22 checkCss*/checkJsxNode rules) and the 3
// post-analyzers (no-dead-token, spacing-near-token, variant-sprawl —
// standalone functions, not Rule objects, but their ruleId still needs a
// catalog entry for SARIF's tool.driver.rules). Kept as its own interface
// rather than folding into Rule so the post-analyzer metadata list doesn't
// need to fake the check* methods.
export interface RuleMetadata {
  id: string;
  category: 'design' | 'a11y' | 'security' | 'quality';
  defaultSeverity: Severity;
  /** one line, imperative, e.g. "Disallow hardcoded color values outside the design token scale" */
  shortDescription?: string;
  /** 2-3 sentences: why the rule exists and what it catches */
  fullDescription?: string;
  /** link to docs, e.g. https://uiseal.io/docs/rules/no-hardcoded-color */
  helpUri?: string;
}

export interface Rule extends RuleMetadata {
  checkCssDeclaration?(decl: Declaration, ctx: RuleContext): void;
  checkCssComment?(comment: Comment, ctx: RuleContext): void;
  /** LESS `@name: value;` variable definitions parse as AtRule nodes, not Declarations. */
  checkCssAtRule?(atRule: AtRule, ctx: RuleContext): void;
  checkJsxNode?(node: TSESTree.Node, ctx: RuleContext): void;
}
