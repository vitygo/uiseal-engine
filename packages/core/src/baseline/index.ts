export type { FingerprintedViolation } from './fingerprint.js';
export { fingerprintViolations } from './fingerprint.js';
export type { BaselineEntry, BaselineFile } from './io.js';
export { readBaseline, readBaselineEntries, writeBaseline } from './io.js';

import fs from 'node:fs';
import path from 'node:path';
import type { Violation } from '../types.js';
import type { FingerprintedViolation } from './fingerprint.js';
import { fingerprintViolations } from './fingerprint.js';
import { readBaseline, readBaselineEntries, writeBaseline } from './io.js';
import type { BaselineFile } from './io.js';

export type BaselineMode = 'filter' | 'all';

export interface BaselineCounts {
  total: number;          // violations found in current scan
  baselined: number;      // frozenCount: in both current scan AND baseline
  new: number;            // newCount: in current scan but NOT in baseline
  resolved: number;       // in baseline but NOT in current scan (fixed!)
  baselineTotal: number;  // total fingerprints in baseline snapshot
}

export interface BaselineResult {
  violations: Violation[];
  counts: BaselineCounts;
}

export type BaselineStatus = 'disabled' | 'active' | 'file-missing';

export interface BaselineState {
  status: BaselineStatus;
  resolvedPath: string;
  counts: BaselineCounts;
}

export interface BaselineRunResult {
  violations: Violation[];
  baseline: BaselineState;
}

export function applyBaseline(
  fingerprintedViolations: FingerprintedViolation[],
  baselineSet: Set<string>,
  mode: BaselineMode,
  baselineTotal: number = baselineSet.size,
): BaselineResult {
  const total = fingerprintedViolations.length;
  const baselinedCount = fingerprintedViolations.filter((v) => baselineSet.has(v.fingerprint)).length;
  const newCount = total - baselinedCount;

  if (mode === 'all') {
    return {
      violations: fingerprintedViolations.map((v) => ({
        ...v,
        frozen: baselineSet.has(v.fingerprint),
      })),
      counts: { total, baselined: baselinedCount, new: newCount, resolved: 0, baselineTotal },
    };
  }

  // filter mode: only surface new violations (not in baseline)
  const newViolations = fingerprintedViolations.filter((v) => !baselineSet.has(v.fingerprint));
  return {
    violations: newViolations,
    counts: { total, baselined: baselinedCount, new: newCount, resolved: 0, baselineTotal },
  };
}

export function resolveBaselineResult(
  rawViolations: Violation[],
  config: { baseline: { enabled: boolean; path: string } },
  projectRoot: string,
): BaselineRunResult {
  const resolvedPath = path.resolve(projectRoot, config.baseline.path);
  const total = rawViolations.length;

  const emptyDebt: BaselineCounts = { total, baselined: 0, new: total, resolved: 0, baselineTotal: 0 };

  if (!config.baseline.enabled) {
    return {
      violations: rawViolations,
      baseline: { status: 'disabled', resolvedPath, counts: emptyDebt },
    };
  }

  if (!fs.existsSync(resolvedPath)) {
    return {
      violations: rawViolations,
      baseline: { status: 'file-missing', resolvedPath, counts: emptyDebt },
    };
  }

  const baselineEntries = readBaselineEntries(resolvedPath);
  const baselineTotal = baselineEntries.length;
  const baselineSet = new Set(baselineEntries.map((e) => e.fingerprint));

  const fv = fingerprintViolations(rawViolations, projectRoot);
  const currentFingerprints = new Set(fv.map((v) => v.fingerprint));
  const resolvedCount = baselineEntries.filter((e) => !currentFingerprints.has(e.fingerprint)).length;

  const { violations, counts } = applyBaseline(fv, baselineSet, 'filter', baselineTotal);

  return {
    violations,
    baseline: {
      status: 'active',
      resolvedPath,
      counts: { ...counts, resolved: resolvedCount },
    },
  };
}

/**
 * Remove baseline entries whose fingerprints no longer appear in currentViolations.
 * Rewrites the baseline file with only the entries still present.
 */
export function pruneBaseline(
  baselinePath: string,
  currentViolations: Violation[],
  projectRoot: string,
): { pruned: number; remaining: number } {
  const entries = readBaselineEntries(baselinePath);
  if (entries.length === 0) return { pruned: 0, remaining: 0 };

  const fv = fingerprintViolations(currentViolations, projectRoot);
  const currentFingerprints = new Set(fv.map((v) => v.fingerprint));

  const kept = entries.filter((e) => currentFingerprints.has(e.fingerprint));
  const pruned = entries.length - kept.length;

  const file: BaselineFile = { version: 1, entries: kept };
  fs.writeFileSync(baselinePath, JSON.stringify(file, null, 2) + '\n', 'utf8');

  return { pruned, remaining: kept.length };
}
