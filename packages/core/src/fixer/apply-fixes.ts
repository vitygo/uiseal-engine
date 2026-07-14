import fs from 'node:fs';
import type { Violation } from '../types.js';

export interface FixApplied {
  ruleId: string;
  line: number;
  column: number;
  oldValue: string;
  newValue: string;
}

export interface FixSkipped {
  ruleId: string;
  line: number;
  column: number;
  reason: 'value-mismatch' | 'file-read-error' | 'no-fix';
}

export interface FixResult {
  file: string;
  applied: FixApplied[];
  skipped: FixSkipped[];
}

export interface ApplyFixesOptions {
  dryRun: boolean;
}

export function applyFixes(violations: Violation[], options: ApplyFixesOptions): FixResult[] {
  const byFile = new Map<string, Violation[]>();
  for (const v of violations) {
    const list = byFile.get(v.file);
    if (list) list.push(v);
    else byFile.set(v.file, [v]);
  }

  const results: FixResult[] = [];
  for (const [file, fileViolations] of byFile) {
    results.push(applyFixesToFile(file, fileViolations, options));
  }
  return results;
}

function applyFixesToFile(
  file: string,
  fileViolations: Violation[],
  options: ApplyFixesOptions,
): FixResult {
  const applied: FixApplied[] = [];
  const skipped: FixSkipped[] = [];

  let content: string;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    for (const v of fileViolations) {
      skipped.push({ ruleId: v.ruleId, line: v.line, column: v.column, reason: 'file-read-error' });
    }
    return { file, applied, skipped };
  }

  const fixable: Violation[] = [];
  for (const v of fileViolations) {
    if (!v.fix?.suggested || !v.oldValue) {
      skipped.push({ ruleId: v.ruleId, line: v.line, column: v.column, reason: 'no-fix' });
      continue;
    }
    fixable.push(v);
  }

  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r\n|\n/);

  const byLine = new Map<number, Violation[]>();
  for (const v of fixable) {
    const list = byLine.get(v.line);
    if (list) list.push(v);
    else byLine.set(v.line, [v]);
  }

  for (const [lineNum, lineViolations] of byLine) {
    const idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) {
      for (const v of lineViolations) {
        skipped.push({ ruleId: v.ruleId, line: v.line, column: v.column, reason: 'value-mismatch' });
      }
      continue;
    }

    let lineText = lines[idx]!;

    // Rules report line/column at the declaration's start (the property
    // name), not the value's offset — true for both postcss decl.source and
    // the JSX inline-style adapter's Property loc. So instead of trusting
    // column as an exact offset, we locate each oldValue by scanning the
    // line's text left-to-right, in emission order (ascending column, which
    // matches source order since rules walk declarations and multi-value
    // parts left-to-right). A moving cursor guarantees each occurrence is
    // consumed at most once, so duplicate/overlapping values can't both
    // claim the same text.
    const ordered = [...lineViolations].sort((a, b) => a.column - b.column);

    let cursor = 0;
    const located: { v: Violation; offset: number }[] = [];
    for (const v of ordered) {
      const oldValue = v.oldValue!;
      const searchFrom = Math.max(cursor, v.column > 0 ? v.column - 1 : 0);
      let foundAt = lineText.indexOf(oldValue, searchFrom);
      if (foundAt === -1) {
        // Column is a hint, not a guarantee — fall back to scanning from
        // the cursor alone before concluding the value truly isn't there.
        foundAt = lineText.indexOf(oldValue, cursor);
      }
      if (foundAt === -1) {
        skipped.push({ ruleId: v.ruleId, line: v.line, column: v.column, reason: 'value-mismatch' });
        continue;
      }
      located.push({ v, offset: foundAt });
      cursor = foundAt + oldValue.length;
    }

    // Apply right-to-left (highest offset first) so earlier offsets on this
    // line stay valid while later (further-right) replacements land.
    located.sort((a, b) => b.offset - a.offset);
    for (const { v, offset } of located) {
      const oldValue = v.oldValue!;
      const newValue = v.fix!.suggested;
      lineText = lineText.slice(0, offset) + newValue + lineText.slice(offset + oldValue.length);
      applied.push({ ruleId: v.ruleId, line: v.line, column: v.column, oldValue, newValue });
    }

    lines[idx] = lineText;
  }

  if (!options.dryRun && applied.length > 0) {
    fs.writeFileSync(file, lines.join(newline));
  }

  return { file, applied, skipped };
}
