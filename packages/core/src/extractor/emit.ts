import { uisealConfigSchema } from '../config/schema.js';
import type { uisealConfig } from '../config/schema.js';
import type { ExtractedTokens } from './index.js';
import type { ColorCluster } from './cluster.js';

export interface ExtractSummary {
  uniqueColors: number;
  colorClusters: number;
  spacingValues: number;
  fontSizeValues: number;
  fontFamilies: number;
  radiiValues: number;
}

export interface EmitResult {
  /** Ready-to-write contents of uiseal.config.ts. */
  configSource: string;
  /** The same config as a parsed object — validated against the Zod schema. */
  configObject: uisealConfig;
  summary: ExtractSummary;
}

const MIN_COUNT = 2;

function resolveTokenKey(
  cluster: ColorCluster,
  cssVars: Map<string, string>,
  index: number,
): string {
  if (cssVars.has(cluster.representative)) return cssVars.get(cluster.representative)!;
  for (const member of cluster.members) {
    if (cssVars.has(member)) return cssVars.get(member)!;
  }
  return `--color-${index + 1}`;
}

function sortedFiltered(map: Map<number, number>): number[] {
  return [...map.entries()]
    .filter(([, count]) => count >= MIN_COUNT)
    .map(([v]) => v)
    .sort((a, b) => a - b);
}

export function emitConfigDraft(
  extracted: ExtractedTokens,
  clusters: ColorCluster[],
): EmitResult {
  const spacingValues = sortedFiltered(extracted.spacing);
  const fontSizeValues = sortedFiltered(extracted.fontSizes);
  const radiiValues = sortedFiltered(extracted.radii);
  const fontFamilyValues = [...extracted.fontFamilies.keys()];

  // Build tokens.colors record — prefer CSS var name from :root, fall back to --color-N
  const colorsRecord: Record<string, string> = {};
  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i]!;
    const tokenKey = resolveTokenKey(cluster, extracted.cssVars, i);
    colorsRecord[tokenKey] = cluster.representative;
  }

  const configObject: uisealConfig = uisealConfigSchema.parse({
    tokens: {
      colors: colorsRecord,
      spacing: spacingValues,
      fontSizes: fontSizeValues,
      fontFamilies: fontFamilyValues,
      radii: radiiValues,
    },
    rules: {
      'no-hardcoded-color': 'warn',
      'no-arbitrary-spacing': 'warn',
      'no-arbitrary-font-size': 'warn',
      'no-arbitrary-radius': 'warn',
      'no-unauthorized-font-family': 'warn',
      'enforce-contrast': 'warn',
    },
    wcag: { level: 'AA' },
    ignore: [],
  });

  // Build source lines for each color token with an annotation comment
  const colorLines: string[] = [];
  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i]!;
    const tokenKey = resolveTokenKey(cluster, extracted.cssVars, i);
    const membersNote = cluster.members
      .map((m) => `${m} (${extracted.colors.get(m) ?? 0}x)`)
      .join(', ');
    colorLines.push(`      // ${membersNote}`);
    colorLines.push(`      '${tokenKey}': '${cluster.representative}',`);
  }

  const configSource = [
    `import { defineConfig } from '@uiseal/core';`,
    ``,
    `export default defineConfig({`,
    `  tokens: {`,
    `    colors: {`,
    ...colorLines,
    `    },`,
    `    spacing: [${spacingValues.join(', ')}],`,
    `    fontSizes: [${fontSizeValues.join(', ')}],`,
    `    fontFamilies: [${fontFamilyValues.map((f) => `'${f}'`).join(', ')}],`,
    `    radii: [${radiiValues.join(', ')}],`,
    `  },`,
    `  rules: {`,
    `    'no-hardcoded-color': 'warn',`,
    `    'no-arbitrary-spacing': 'warn',`,
    `    'no-arbitrary-font-size': 'warn',`,
    `    'no-arbitrary-radius': 'warn',`,
    `    'no-unauthorized-font-family': 'warn',`,
    `    'enforce-contrast': 'warn',`,
    `  },`,
    `  wcag: { level: 'AA' },`,
    `  ignore: [],`,
    `});`,
  ].join('\n');

  const summary: ExtractSummary = {
    uniqueColors: extracted.colors.size,
    colorClusters: clusters.length,
    spacingValues: spacingValues.length,
    fontSizeValues: fontSizeValues.length,
    fontFamilies: fontFamilyValues.length,
    radiiValues: radiiValues.length,
  };

  return { configSource, configObject, summary };
}
