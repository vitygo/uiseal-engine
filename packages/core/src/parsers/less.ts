import { parse as lessParse } from 'postcss-less';
import type { Root } from 'postcss';

// postcss-less's Root is a postcss Root subtype — declarations and nested
// rules walk exactly like plain CSS. Note: top-level `@name: value;`
// variable definitions parse as AtRule nodes (not Declarations) — see
// no-hardcoded-color.ts's checkCssAtRule for how those are still checked.
export function parseLess(code: string, filePath: string): Root {
  return lessParse(code, { from: filePath });
}
