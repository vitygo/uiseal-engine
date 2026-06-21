export const version = '0.0.1';

export type { Violation, SkeletonNode } from './types.js';
export { uisealConfigSchema, defineConfig } from './config/schema.js';
export type { uisealConfig } from './config/schema.js';
export { loadConfig } from './config/load.js';
export type { LoadConfigResult } from './config/load.js';
export {
  findClosestColorToken,
  isAllowedSpacing,
  isAllowedFontSize,
  isAllowedRadius,
  isAllowedFontFamily,
} from './config/helpers.js';
export { parseCss } from './parsers/css.js';
export { parseJsx } from './parsers/jsx.js';
export type { ParseResult } from './parsers/jsx.js';
export type { Rule, RuleContext, Severity } from './rules/types.js';
export { allRules, securityRules } from './rules/index.js';
export { analyze } from './runner.js';
export type { AnalyzeInput, AnalysisResult } from './runner.js';
export { validateLicense, getRulesForPlan } from './license/index.js';
export type { Plan, LicenseState, ValidateResponse } from './license/index.js';
export { fetchAppConfig } from './app-config/index.js';
export type { AppConfigState } from './app-config/index.js';
export { formatReport } from './reporter/terminal.js';
export { extract } from './extractor/index.js';
export type { ExtractedTokens } from './extractor/index.js';
export { clusterColors } from './extractor/cluster.js';
export type { ColorCluster } from './extractor/cluster.js';
export { emitConfigDraft } from './extractor/emit.js';
export type { ExtractSummary, EmitResult } from './extractor/emit.js';
export { fingerprintViolations, applyBaseline, readBaseline, readBaselineEntries, writeBaseline, resolveBaselineResult, pruneBaseline } from './baseline/index.js';
export type {
  FingerprintedViolation,
  BaselineEntry,
  BaselineFile,
  BaselineMode,
  BaselineCounts,
  BaselineResult,
  BaselineStatus,
  BaselineState,
  BaselineRunResult,
} from './baseline/index.js';
export { setBaselineEnabled } from './config/writer.js';
export { diffScans, formatDiffAsMarkdown } from './diff/index.js';
export type { ViolationSnapshot, DiffResult } from './diff/index.js';
