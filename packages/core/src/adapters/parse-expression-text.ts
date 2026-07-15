// Parses a framework binding's raw expression text (e.g. "{ padding: '13px' }"
// or "['px-4', cond ? 'mt-[13px]' : 'mt-2']") as a standalone JS expression,
// via the existing JS/TS parser (@typescript-eslint/parser) rather than a
// bespoke mini-parser. Wrapped in parens to force expression (not
// block-statement) context, matching how `{ ... }` at statement position
// would otherwise parse as a block. Shared by the Vue and Angular template
// adapters — a Vue `:style="{}"` and an Angular `[ngStyle]="{}"` are both
// "some framework's directive holds a raw JS expression string," and the
// parsing step is identical either way.
import { parseJsx } from '../parsers/jsx.js';

export function parseExpressionText(exprText: string): ReturnType<typeof parseJsx>['body'][number] | null {
  try {
    const program = parseJsx(`(${exprText})`);
    return program.body[0] ?? null;
  } catch {
    return null; // not statically parseable (dynamic/computed) — skip
  }
}
