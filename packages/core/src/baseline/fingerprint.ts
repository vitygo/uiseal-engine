import crypto from 'node:crypto';
import path from 'node:path';
import type { Violation } from '../types.js';

export interface FingerprintedViolation extends Violation {
  fingerprint: string;
}

export function fingerprintViolations(
  violations: Violation[],
  projectRoot: string,
): FingerprintedViolation[] {
  // Sort by file → line → column so occurrence indices are deterministic.
  const sorted = [...violations].sort((a, b) => {
    const fc = a.file.localeCompare(b.file);
    if (fc !== 0) return fc;
    if (a.line !== b.line) return a.line - b.line;
    return a.column - b.column;
  });

  const counter = new Map<string, number>();

  return sorted.map((v) => {
    const relFile = path.relative(projectRoot, v.file).replace(/\\/g, '/');
    // ruleId + relFile + message captures the offending value without position.
    const key = `${v.ruleId}\0${relFile}\0${v.message}`;
    const idx = counter.get(key) ?? 0;
    counter.set(key, idx + 1);

    const fingerprint = crypto
      .createHash('sha1')
      .update(`${key}\0${idx}`)
      .digest('hex');

    return { ...v, fingerprint };
  });
}
