import type { uisealConfig } from '../config/schema.js';
import type { Rule } from '../rules/types.js';
import type { Violation } from '../types.js';
import type { TokenDef } from '../analyzers/no-dead-token.js';
import type { SpacingUsage } from '../analyzers/spacing-near-token.js';
import { analyzeFile, runPostAnalyzers, type FileAnalysis } from '../runner.js';
import { validateLicense, type LicenseState } from '../license/index.js';

export interface FileChange {
  path: string;
  content: string;
}

export interface IncrementalSummary {
  total: number;
  errors: number;
  warnings: number;
  fixable: number;
  filesWithViolations: number;
}

// Safe default while the real license state resolves in the background —
// same behavior analyze() falls back to: variant-sprawl (Team+) is simply
// omitted until a paid plan is confirmed.
const FREE_LICENSE_STATE: LicenseState = {
  valid: true,
  plan: 'free',
  token: null,
  trialEndsAt: null,
  cachedAt: new Date(0),
  source: 'none',
};

// Re-scans only the files that changed instead of the whole project.
// Per-file rule violations are cached in `analysisCache`; dead-token,
// spacing-near-token, and variant-sprawl (the 3 cross-file post-analyzers)
// can't be computed from one file in isolation, so they're re-run over the
// merged totals on every update() — cheap, since they operate on already-
// extracted token/spacing data (and variant-sprawl's own raw-file diffing),
// not on re-parsing source files.
export class IncrementalAnalyzer {
  private readonly config: uisealConfig;
  private readonly rules: Rule[];
  private readonly fileCache = new Map<string, string>();
  private readonly analysisCache = new Map<string, FileAnalysis>();
  private licenseState: LicenseState = FREE_LICENSE_STATE;
  private cachedResult: Violation[] | null = null;

  constructor(config: uisealConfig, rules: Rule[]) {
    this.config = config;
    this.rules = rules;

    // License validation is network I/O; resolving it once in the
    // background (rather than awaiting it here or on every update()) keeps
    // update() synchronous and fast, matching what a save-triggered watch
    // update needs. Until it resolves, we stay on the free-tier default.
    const token = process.env['UISEAL_TOKEN'] ?? null;
    const apiUrl = process.env['UISEAL_API_URL'] ?? 'https://api.uiseal.io';
    validateLicense(token, apiUrl, process.cwd())
      .then((state) => {
        this.licenseState = state;
        this.cachedResult = null; // plan may have changed which post-analyzers apply
      })
      .catch(() => {
        /* keep the free-tier default */
      });
  }

  // Re-analyzes ONLY the given files (parse + rule dispatch), updates their
  // cached per-file results, then returns the merged violations across
  // every file the analyzer knows about (cached + just-updated).
  update(changes: FileChange[]): Violation[] {
    for (const { path, content } of changes) {
      this.fileCache.set(path, content);
      this.analysisCache.set(path, analyzeFile(path, content, this.config, this.rules));
    }
    this.cachedResult = null;
    return this.getAll();
  }

  remove(filePath: string): Violation[] {
    this.fileCache.delete(filePath);
    this.analysisCache.delete(filePath);
    this.cachedResult = null;
    return this.getAll();
  }

  getAll(): Violation[] {
    if (this.cachedResult) return this.cachedResult;

    const baseViolations: Violation[] = [];
    const definedTokens: TokenDef[] = [];
    const usedVarRefs = new Set<string>();
    const spacingUsages: SpacingUsage[] = [];

    for (const fa of this.analysisCache.values()) {
      baseViolations.push(...fa.violations);
      definedTokens.push(...fa.definedTokens);
      for (const ref of fa.usedVarRefs) usedVarRefs.add(ref);
      spacingUsages.push(...fa.spacingUsages);
    }

    this.cachedResult = runPostAnalyzers(
      baseViolations,
      { definedTokens, usedVarRefs, spacingUsages },
      this.fileCache,
      this.config,
      this.licenseState,
    );
    return this.cachedResult;
  }

  getSummary(): IncrementalSummary {
    const violations = this.getAll();
    return {
      total: violations.length,
      errors: violations.filter((v) => v.severity === 'error').length,
      warnings: violations.filter((v) => v.severity === 'warning').length,
      fixable: violations.filter((v) => v.fix?.suggested).length,
      filesWithViolations: new Set(violations.map((v) => v.file)).size,
    };
  }
}
