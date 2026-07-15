// Drift is different from a check violation: `check` compares code against
// the uiseal.config.json SNAPSHOT taken at init time. `drift` re-reads the
// LIVE token source right now (the actual current tailwind.config.js / CSS
// variables file / code-scan) and compares it against the actual current
// code — catching both "the source moved on and the config never got
// re-synced" and "the codebase has quietly accumulated off-token values."
import fs from 'node:fs';
import { glob } from 'glob';
import { buildGlob } from '../parsers/registry.js';
import { detectSources, getSourceById, getAllSources } from '../sources/registry.js';
import type { SourceTokens } from '../sources/types.js';
import { findNearestNumeric } from '../values/nearest-token.js';
import { findNearestColorAgainst } from './nearest-color.js';
import { collectCodeValues, normalizeHex, type DriftLocation } from './collect-code-values.js';

export interface DriftFileRef {
  file: string;
  line: number;
  column: number;
}

export interface DriftedValue {
  /** the off-token value: "#1a73e8" or "13px" */
  value: string;
  /** closest valid token, if within threshold */
  nearestToken?: string;
  occurrences: number;
  files: DriftFileRef[];
}

export interface DriftCategory {
  tokensInSource: number;
  uniqueValuesInCode: number;
  driftedValues: DriftedValue[];
  /** tokens defined in the source but never found in code */
  unusedTokens: (string | number)[];
}

export interface DriftReport {
  source: { id: string; file?: string };
  timestamp: string;
  summary: {
    filesScanned: number;
    /** total value OCCURRENCES across the codebase (a value used 5 times counts 5x), not unique values — the headline "N values extracted" figure */
    totalValueOccurrences: number;
    totalTokensInSource: number;
    totalUniqueValuesInCode: number;
    totalDriftedValues: number;
    totalUnusedTokens: number;
    driftPercentage: number;
  };
  categories: {
    colors: DriftCategory;
    spacing: DriftCategory;
    fontSizes: DriftCategory;
    radii: DriftCategory;
    fontFamilies: DriftCategory;
  };
}

export interface AnalyzeDriftOptions {
  cwd: string;
  /** specific source id ('tailwind' | 'css-vars' | 'code-scan'); auto-detects (highest confidence) when omitted */
  sourceId?: string;
  /** inject a pre-read file set (mainly for tests) instead of globbing `cwd` */
  files?: Map<string, string>;
}

// Same thresholds the corresponding rules use (spacing-near-token.ts,
// no-arbitrary-font-size.ts, no-arbitrary-radius.ts) — consistent
// "how close counts as a suggestible near-miss" everywhere.
const SPACING_THRESHOLD = 4;
const FONT_SIZE_THRESHOLD = 2;
const RADIUS_THRESHOLD = 2;

function toSortedDriftedValues(values: DriftedValue[]): DriftedValue[] {
  return [...values].sort((a, b) => b.occurrences - a.occurrences);
}

function buildNumericCategory(
  sourceTokens: number[],
  codeValues: Map<number, DriftLocation[]>,
  threshold: number,
): DriftCategory {
  const sourceSet = new Set(sourceTokens);
  const driftedValues: DriftedValue[] = [];

  for (const [value, locations] of codeValues) {
    if (sourceSet.has(value)) continue;
    const nearest = sourceTokens.length > 0 ? findNearestNumeric(value, sourceTokens, { threshold }) : null;
    driftedValues.push({
      value: `${value}px`,
      nearestToken: nearest?.withinThreshold ? `${nearest.value}px` : undefined,
      occurrences: locations.length,
      files: locations,
    });
  }

  const usedSet = new Set(codeValues.keys());
  const unusedTokens = sourceTokens.filter((t) => !usedSet.has(t));

  return {
    tokensInSource: sourceTokens.length,
    uniqueValuesInCode: codeValues.size,
    driftedValues: toSortedDriftedValues(driftedValues),
    unusedTokens,
  };
}

function buildColorCategory(
  sourceColors: Record<string, string>,
  codeValues: Map<string, DriftLocation[]>,
): DriftCategory {
  const sourceHexSet = new Set(
    Object.values(sourceColors).map((v) => normalizeHex(v) ?? v.toLowerCase()),
  );
  const driftedValues: DriftedValue[] = [];

  for (const [hex, locations] of codeValues) {
    if (sourceHexSet.has(hex)) continue;
    const nearest = findNearestColorAgainst(hex, sourceColors);
    driftedValues.push({
      value: hex,
      nearestToken: nearest ? `${nearest.name} (${nearest.hex})` : undefined,
      occurrences: locations.length,
      files: locations,
    });
  }

  const usedHexSet = new Set(codeValues.keys());
  const unusedTokens = Object.entries(sourceColors)
    .filter(([, hex]) => !usedHexSet.has(normalizeHex(hex) ?? hex.toLowerCase()))
    .map(([name]) => name);

  return {
    tokensInSource: Object.keys(sourceColors).length,
    uniqueValuesInCode: codeValues.size,
    driftedValues: toSortedDriftedValues(driftedValues),
    unusedTokens,
  };
}

function buildFontFamilyCategory(
  sourceFamilies: string[],
  codeValues: Map<string, DriftLocation[]>,
): DriftCategory {
  const sourceSet = new Set(sourceFamilies.map((f) => f.toLowerCase()));
  const driftedValues: DriftedValue[] = [];

  for (const [family, locations] of codeValues) {
    if (sourceSet.has(family.toLowerCase())) continue;
    driftedValues.push({ value: family, occurrences: locations.length, files: locations });
  }

  const usedSet = new Set([...codeValues.keys()].map((f) => f.toLowerCase()));
  const unusedTokens = sourceFamilies.filter((f) => !usedSet.has(f.toLowerCase()));

  return {
    tokensInSource: sourceFamilies.length,
    uniqueValuesInCode: codeValues.size,
    driftedValues: toSortedDriftedValues(driftedValues),
    unusedTokens,
  };
}

async function discoverFiles(cwd: string): Promise<Map<string, string>> {
  const filePaths = await glob(buildGlob(), {
    cwd,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**'],
    absolute: true,
  });

  const files = new Map<string, string>();
  for (const fp of filePaths) {
    files.set(fp, fs.readFileSync(fp, 'utf8'));
  }
  return files;
}

async function resolveSource(
  cwd: string,
  sourceId?: string,
): Promise<{ id: string; tokens: SourceTokens; file?: string }> {
  if (sourceId) {
    const source = getSourceById(sourceId);
    if (!source) {
      const available = getAllSources().map((s) => s.id).join(', ');
      throw new Error(`Unknown token source "${sourceId}". Available: ${available}.`);
    }
    const detectResult = await source.detect(cwd);
    if (!detectResult.found) {
      throw new Error(`No ${source.label} found in ${cwd}.`);
    }
    return { id: source.id, tokens: await source.extract(cwd), file: detectResult.file };
  }

  const detected = await detectSources(cwd);
  if (detected.length === 0) {
    throw new Error(`No token source detected in ${cwd}. Run "uiseal init" first, or pass --source explicitly.`);
  }
  const best = detected[0]!;
  return { id: best.source.id, tokens: await best.source.extract(cwd), file: best.result.file };
}

export async function analyzeDrift(options: AnalyzeDriftOptions): Promise<DriftReport> {
  const { cwd, sourceId } = options;

  const { id, tokens: sourceTokens, file } = await resolveSource(cwd, sourceId);
  const files = options.files ?? (await discoverFiles(cwd));
  const codeValues = collectCodeValues(files);

  const categories = {
    colors: buildColorCategory(sourceTokens.colors, codeValues.colors),
    spacing: buildNumericCategory(sourceTokens.spacing, codeValues.spacing, SPACING_THRESHOLD),
    fontSizes: buildNumericCategory(sourceTokens.fontSizes, codeValues.fontSizes, FONT_SIZE_THRESHOLD),
    radii: buildNumericCategory(sourceTokens.radii, codeValues.radii, RADIUS_THRESHOLD),
    fontFamilies: buildFontFamilyCategory(sourceTokens.fontFamilies, codeValues.fontFamilies),
  };

  const categoryList = Object.values(categories);
  const totalTokensInSource = categoryList.reduce((sum, c) => sum + c.tokensInSource, 0);
  const totalUniqueValuesInCode = categoryList.reduce((sum, c) => sum + c.uniqueValuesInCode, 0);
  const totalDriftedValues = categoryList.reduce((sum, c) => sum + c.driftedValues.length, 0);
  const totalUnusedTokens = categoryList.reduce((sum, c) => sum + c.unusedTokens.length, 0);
  const driftPercentage =
    totalUniqueValuesInCode === 0 ? 0 : (totalDriftedValues / totalUniqueValuesInCode) * 100;

  const sumOccurrences = (map: Map<unknown, DriftLocation[]>): number =>
    [...map.values()].reduce((sum, locs) => sum + locs.length, 0);
  const totalValueOccurrences =
    sumOccurrences(codeValues.colors) +
    sumOccurrences(codeValues.spacing) +
    sumOccurrences(codeValues.fontSizes) +
    sumOccurrences(codeValues.radii) +
    sumOccurrences(codeValues.fontFamilies);

  return {
    source: { id, file },
    timestamp: new Date().toISOString(),
    summary: {
      filesScanned: files.size,
      totalValueOccurrences,
      totalTokensInSource,
      totalUniqueValuesInCode,
      totalDriftedValues,
      totalUnusedTokens,
      driftPercentage,
    },
    categories,
  };
}
