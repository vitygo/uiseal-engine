// Parses a .svelte file with the real Svelte compiler (Option A — chosen
// over regex scanning): `svelte` is a modest dependency (comparable to
// @vue/compiler-sfc, no heavyweight template-engine tail like Vue's
// `consolidate`), and its AST gives exact positions for free — every
// Attribute/StyleDirective/Class node carries a `name_loc.start` that's
// already absolute within the .svelte file (verified empirically, same as
// Vue's compiler-sfc), so the template side needs no offset math at all.
// Only the <style> block does, since postcss parses its content in
// isolation — same formula as Vue/Angular's style blocks.
import { parse } from 'svelte/compiler';
import postcss from 'postcss';
import type { Root } from 'postcss';
import { parseScss } from './scss.js';
import { parseLess } from './less.js';

export interface SvelteStyleBlock {
  content: string;
  /** 'css' | 'scss' | 'less' (defaults to 'css' when no lang attribute) */
  lang: string;
  root: Root;
  /** add to a postcss-reported line number to get the true .svelte file line */
  offset: number;
}

export type SvelteParsedFile = {
  kind: 'svelte';
  styles: SvelteStyleBlock[];
  /** Svelte's own template AST (the html Fragment) — not TSESTree, walked separately. */
  template: unknown | null;
};

function lineOfOffset(source: string, charOffset: number): number {
  let line = 1;
  for (let i = 0; i < charOffset && i < source.length; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

interface SvelteAstAttribute {
  type: string;
  name: string;
  value?: Array<{ type: string; data?: string }>;
}

function findLangAttr(attributes: SvelteAstAttribute[] | undefined): string {
  const langAttr = attributes?.find((a) => a.type === 'Attribute' && a.name === 'lang');
  const value = langAttr?.value?.[0];
  return value?.type === 'Text' && value.data ? value.data : 'css';
}

export function parseSvelte(source: string): SvelteParsedFile {
  const ast = parse(source, { filename: 'component.svelte' }) as unknown as {
    html: unknown;
    css?: { attributes?: SvelteAstAttribute[]; content: { start: number; styles: string } } | null;
  };

  const styles: SvelteStyleBlock[] = [];
  if (ast.css) {
    const lang = findLangAttr(ast.css.attributes);
    const content = ast.css.content.styles;
    const root: Root =
      lang === 'scss'
        ? parseScss(content, 'style.scss')
        : lang === 'less'
          ? parseLess(content, 'style.less')
          : postcss.parse(content);

    styles.push({
      content,
      lang,
      root,
      offset: lineOfOffset(source, ast.css.content.start) - 1,
    });
  }

  return { kind: 'svelte', styles, template: ast.html };
}
