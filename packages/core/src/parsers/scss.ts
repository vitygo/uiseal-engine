import { parse as scssParse } from 'postcss-scss';
import type { Root } from 'postcss';

// postcss-scss's Root is a postcss Root subtype — declarations (including
// $variable definitions/usages) and nested rules walk exactly like plain CSS.
export function parseScss(code: string, filePath: string): Root {
  return scssParse(code, { from: filePath });
}
