import { codeScanSource } from './code-scan.js';
import { tailwindSource } from './tailwind.js';
import { cssVarsSource } from './css-vars.js';
import type { DetectResult, TokenSource } from './types.js';

// Adding a new token source is a one-file task: write it against
// TokenSource, then push it into this array.
const sources: TokenSource[] = [tailwindSource, cssVarsSource, codeScanSource];

export function getAllSources(): TokenSource[] {
  return [...sources];
}

export function getSourceById(id: string): TokenSource | undefined {
  return sources.find((s) => s.id === id);
}

export interface DetectedSource {
  source: TokenSource;
  result: DetectResult;
}

/** Runs detect() on every registered source; returns the found ones, highest confidence first. */
export async function detectSources(cwd: string): Promise<DetectedSource[]> {
  const detected: DetectedSource[] = [];
  for (const source of sources) {
    const result = await source.detect(cwd);
    if (result.found) detected.push({ source, result });
  }
  return detected.sort((a, b) => b.result.confidence - a.result.confidence);
}
