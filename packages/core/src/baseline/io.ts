import fs from 'node:fs';
import path from 'node:path';
import type { FingerprintedViolation } from './fingerprint.js';

export interface BaselineEntry {
  fingerprint: string;
  ruleId: string;
  file: string;
}

export interface BaselineFile {
  version: 1;
  entries: BaselineEntry[];
}

export function readBaseline(baselinePath: string): Set<string> {
  if (!fs.existsSync(baselinePath)) return new Set();
  try {
    const raw = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as BaselineFile;
    if (!Array.isArray(raw.entries)) return new Set();
    return new Set(raw.entries.map((e) => e.fingerprint));
  } catch {
    return new Set();
  }
}

export function readBaselineEntries(baselinePath: string): BaselineEntry[] {
  if (!fs.existsSync(baselinePath)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as BaselineFile;
    if (!Array.isArray(raw.entries)) return [];
    return raw.entries;
  } catch {
    return [];
  }
}

export function writeBaseline(
  baselinePath: string,
  violations: FingerprintedViolation[],
  projectRoot: string,
): void {
  const seen = new Set<string>();
  const entries: BaselineEntry[] = [];

  for (const v of violations) {
    if (seen.has(v.fingerprint)) continue;
    seen.add(v.fingerprint);
    entries.push({
      fingerprint: v.fingerprint,
      ruleId: v.ruleId,
      file: path.relative(projectRoot, v.file).replace(/\\/g, '/'),
    });
  }

  // Sort by fingerprint for diff-stable git output.
  entries.sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));

  const file: BaselineFile = { version: 1, entries };
  fs.writeFileSync(baselinePath, JSON.stringify(file, null, 2) + '\n', 'utf8');
}
