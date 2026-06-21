import type { Root } from 'postcss';
import type { uisealConfig } from '../config/schema.js';
import type { Violation } from '../types.js';

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
  if (part === '0' || part === 'auto') return null;
  if (part.endsWith('%')) return null;
  if (/^var\s*\(/.test(part)) return null;
  if (/^calc\s*\(|^env\s*\(/.test(part)) return null;

  if (part.endsWith('px')) {
    const num = parseFloat(part);
    return isNaN(num) ? null : num;
  }
  if (part.endsWith('rem')) {
    const num = parseFloat(part);
    return isNaN(num) ? null : num * 16;
  }
  return null;
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
    const nearest = findNearest(usage.valuePx, scale);
    if (nearest === null) continue;
    const diff = Math.abs(usage.valuePx - nearest);
    if (diff === 0 || diff > NEAR_MISS_THRESHOLD) continue;

    suppressKeys.add(makeSuppressKey(usage));
    violations.push({
      ruleId: 'spacing-near-token',
      severity,
      message: `Spacing value ${usage.valuePx}px is ${diff}px away from token ${nearest}px. Did you mean ${nearest}px? If intentional, add to your spacing scale.`,
      file: usage.file,
      line: usage.line,
      column: usage.column,
    });
  }

  return { violations, suppressKeys };
}

function findNearest(value: number, scale: number[]): number | null {
  if (scale.length === 0) return null;
  let nearest = scale[0]!;
  let nearestDist = Math.abs(value - nearest);
  for (let i = 1; i < scale.length; i++) {
    const d = Math.abs(value - scale[i]!);
    if (d < nearestDist || (d === nearestDist && scale[i]! < nearest)) {
      nearestDist = d;
      nearest = scale[i]!;
    }
  }
  return nearest;
}

export function makeSuppressKey(usage: SpacingUsage): string {
  return `${usage.file}|${usage.line}|${usage.column}|${usage.rawPart}`;
}
