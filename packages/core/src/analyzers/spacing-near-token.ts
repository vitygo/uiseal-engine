import type { Root } from 'postcss';
import type { uisealConfig } from '../config/schema.js';
import type { Violation } from '../types.js';
import { parseValue } from '../values/parse-value.js';
import { findNearestNumeric } from '../values/nearest-token.js';

const SPACING_PROP_RE =
  /^(margin(-top|-right|-bottom|-left)?|padding(-top|-right|-bottom|-left)?|gap|row-gap|column-gap|top|left|right|bottom)$/;

const NEAR_MISS_THRESHOLD = 4;
const MIN_SCALE_SIZE = 5;

export interface SpacingUsage {
  valuePx: number;
  rawPart: string;
  file: string;
  line: number;
  column: number;
}

export function collectNonAllowedSpacingUsages(
  filePath: string,
  root: Root,
  config: uisealConfig,
): SpacingUsage[] {
  const usages: SpacingUsage[] = [];
  const scale = config.tokens.spacing;

  root.walkDecls((decl) => {
    if (!SPACING_PROP_RE.test(decl.prop)) return;
    const parts = decl.value.trim().split(/\s+/);
    for (const part of parts) {
      const valuePx = toPixels(part);
      if (valuePx === null) continue;
      if (scale.includes(valuePx)) continue;
      usages.push({
        valuePx,
        rawPart: part,
        file: filePath,
        line: decl.source?.start?.line ?? 1,
        column: decl.source?.start?.column ?? 0,
      });
    }
  });

  return usages;
}

function toPixels(part: string): number | null {
  const parsed = parseValue(part);
  return parsed.unit === 'px' || parsed.unit === 'rem' ? parsed.value : null;
}

export interface SpacingNearTokenResult {
  violations: Violation[];
  suppressKeys: Set<string>;
}

export function analyzeSpacingNearToken(
  usages: SpacingUsage[],
  config: uisealConfig,
): SpacingNearTokenResult {
  const override = config.rules['spacing-near-token'];
  if (override === 'off') return { violations: [], suppressKeys: new Set() };

  const scale = config.tokens.spacing;
  if (scale.length < MIN_SCALE_SIZE) return { violations: [], suppressKeys: new Set() };

  const severity: 'error' | 'warning' = override === 'error' ? 'error' : 'warning';

  const violations: Violation[] = [];
  const suppressKeys = new Set<string>();

  for (const usage of usages) {
    const nearest = findNearestNumeric(usage.valuePx, scale, { threshold: NEAR_MISS_THRESHOLD });
    if (nearest === null) continue;
    const diff = nearest.distance;
    if (diff === 0 || !nearest.withinThreshold) continue;

    suppressKeys.add(makeSuppressKey(usage));
    violations.push({
      ruleId: 'spacing-near-token',
      severity,
      message: `Spacing value ${usage.valuePx}px is ${diff}px away from token ${nearest.value}px. Did you mean ${nearest.value}px? If intentional, add to your spacing scale.`,
      file: usage.file,
      line: usage.line,
      column: usage.column,
    });
  }

  return { violations, suppressKeys };
}

export function makeSuppressKey(usage: SpacingUsage): string {
  return `${usage.file}|${usage.line}|${usage.column}|${usage.rawPart}`;
}
