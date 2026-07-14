import fs from 'node:fs';
import { glob } from 'glob';
import { extract } from '../extractor/index.js';
import { clusterColors } from '../extractor/cluster.js';
import { buildGlob } from '../parsers/registry.js';
import type { ColorCluster } from '../extractor/cluster.js';
import type { DetectResult, SourceTokens, TokenSource } from './types.js';

const MIN_COUNT = 2;

function sortedFiltered(map: Map<number, number>): number[] {
  return [...map.entries()]
    .filter(([, count]) => count >= MIN_COUNT)
    .map(([v]) => v)
    .sort((a, b) => a - b);
}

function resolveColorKey(cluster: ColorCluster, cssVars: Map<string, string>, index: number): string {
  if (cssVars.has(cluster.representative)) return cssVars.get(cluster.representative)!;
  for (const member of cluster.members) {
    const key = cssVars.get(member);
    if (key) return key;
  }
  return `--color-${index + 1}`;
}

export const codeScanSource: TokenSource = {
  id: 'code-scan',
  label: 'Scan existing code',

  // Fallback source of last resort — always "available" (there's always
  // source code to scan), but ranked below every real token source.
  async detect(): Promise<DetectResult> {
    return { found: true, confidence: 0.1 };
  },

  async extract(cwd: string): Promise<SourceTokens> {
    const filePaths = await glob(buildGlob(), {
      cwd,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**'],
      absolute: true,
    });

    const files = new Map<string, string>();
    for (const fp of filePaths) {
      files.set(fp, fs.readFileSync(fp, 'utf8'));
    }

    const extracted = extract(files);
    const clusters = clusterColors(extracted.colors);

    const colors: Record<string, string> = {};
    clusters.forEach((cluster, i) => {
      colors[resolveColorKey(cluster, extracted.cssVars, i)] = cluster.representative;
    });

    return {
      colors,
      spacing: sortedFiltered(extracted.spacing),
      fontSizes: sortedFiltered(extracted.fontSizes),
      fontFamilies: [...extracted.fontFamilies.keys()],
      radii: sortedFiltered(extracted.radii),
    };
  },
};
