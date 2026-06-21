import type { TSESTree } from '@typescript-eslint/types';
import type { Root } from 'postcss';
import type { Violation } from './types.js';

export type IgnoreMap = Map<number, Set<string>>;

// Captures rule IDs (comma-separated word/hyphen tokens) before an optional "-- reason".
const IGNORE_RE = /uiseal-ignore\s*((?:[\w-]+(?:\s*,\s*[\w-]+)*)?)\s*(?:--.*)?$/i;

function parseRuleIds(raw: string): Set<string> {
  const trimmed = raw.trim();
  if (!trimmed) return new Set(); // empty = suppress all
  return new Set(trimmed.split(',').map((r) => r.trim()).filter(Boolean));
}

function isCommentOrBlank(line: string): boolean {
  const t = line.trim();
  return t === '' || t.startsWith('//') || t.startsWith('/*') || t.startsWith('*');
}

/**
 * Find the 1-indexed line number of the first non-blank, non-comment-only line
 * strictly after `afterLine` (1-indexed). Returns null if none found.
 */
function findNextCodeLine(lines: string[], afterLine: number): number | null {
  // lines is 0-indexed; afterLine is 1-indexed, so lines[afterLine] is one line below.
  for (let i = afterLine; i < lines.length; i++) {
    if (!isCommentOrBlank(lines[i]!)) return i + 1; // back to 1-indexed
  }
  return null;
}

export function buildCssIgnoreMap(source: string, root: Root): IgnoreMap {
  const map: IgnoreMap = new Map();
  const lines = source.split('\n');
  root.walkComments((comment) => {
    const m = IGNORE_RE.exec(comment.text);
    if (!m) return;
    const endLine = comment.source?.end?.line ?? comment.source?.start?.line ?? 1;
    const target = findNextCodeLine(lines, endLine);
    if (target === null) return;
    map.set(target, parseRuleIds(m[1] ?? ''));
  });
  return map;
}

export function buildJsxIgnoreMap(source: string, program: TSESTree.Program): IgnoreMap {
  const map: IgnoreMap = new Map();
  const lines = source.split('\n');
  for (const comment of program.comments ?? []) {
    const m = IGNORE_RE.exec(comment.value);
    if (!m) continue;
    const endLine = comment.loc?.end.line ?? comment.loc?.start.line ?? 1;
    const target = findNextCodeLine(lines, endLine);
    if (target === null) continue;
    const ruleIds = parseRuleIds(m[1] ?? '');
    const existing = map.get(target);
    if (existing === undefined) {
      map.set(target, ruleIds);
    } else if (existing.size > 0 && ruleIds.size === 0) {
      map.set(target, new Set()); // suppress-all wins
    } else if (existing.size > 0) {
      for (const id of ruleIds) existing.add(id);
    }
  }
  return map;
}

export function applyIgnoreMap(violations: Violation[], ignoreMap: IgnoreMap): Violation[] {
  if (ignoreMap.size === 0) return violations;
  return violations.filter((v) => {
    const entry = ignoreMap.get(v.line);
    if (entry === undefined) return true;
    if (entry.size === 0) return false; // suppress all
    return !entry.has(v.ruleId);
  });
}
