import postcss from 'postcss';
import type { Root } from 'postcss';

export function parseCss(code: string): Root {
  return postcss.parse(code);
}
