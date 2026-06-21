import type { Declaration, Comment } from 'postcss';
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

export interface Rule {
  id: string;
  category: 'design' | 'a11y' | 'security' | 'quality';
  defaultSeverity: Severity;
  checkCssDeclaration?(decl: Declaration, ctx: RuleContext): void;
  checkCssComment?(comment: Comment, ctx: RuleContext): void;
  checkJsxNode?(node: TSESTree.Node, ctx: RuleContext): void;
}
