import { parse as parseSfc } from '@vue/compiler-sfc';
import type { SFCStyleBlock } from '@vue/compiler-sfc';
import postcss from 'postcss';
import type { Root } from 'postcss';
import { parseScss } from './scss.js';
import { parseLess } from './less.js';

export interface VueStyleBlock {
  /** raw CSS/SCSS/LESS text between the <style> tags */
  content: string;
  /** 'css' | 'scss' | 'less' (defaults to 'css' when no lang attribute) */
  lang: string;
  root: Root;
  /**
   * Add to a postcss-reported line number to get the true line within the
   * .vue file — postcss parses `content` in isolation starting at line 1,
   * but content is a slice starting partway through the real file.
   */
  offset: number;
}

export interface VueTemplateInfo {
  /** Vue's own template AST (RootNode) — not TSESTree, walked separately. */
  ast: unknown;
  /**
   * Always 0. Verified empirically: unlike style block content (parsed by
   * postcss in isolation, needing the `offset` above), @vue/compiler-sfc
   * reports template AST node positions already absolute within the whole
   * .vue file. Kept only for structural symmetry with VueStyleBlock.
   */
  offset: number;
}

export type VueParsedFile = {
  kind: 'vue';
  styles: VueStyleBlock[];
  template: VueTemplateInfo | null;
};

function parseStyleBlock(style: SFCStyleBlock): VueStyleBlock {
  const lang = style.lang ?? 'css';
  const root: Root =
    lang === 'scss'
      ? parseScss(style.content, 'style.scss')
      : lang === 'less'
        ? parseLess(style.content, 'style.less')
        : postcss.parse(style.content);

  return {
    content: style.content,
    lang,
    root,
    offset: style.loc.start.line - 1,
  };
}

export function parseVue(source: string, filePath: string): VueParsedFile {
  const { descriptor } = parseSfc(source, { filename: filePath });

  const styles = descriptor.styles.map(parseStyleBlock);
  const template: VueTemplateInfo | null = descriptor.template
    ? { ast: descriptor.template.ast, offset: 0 }
    : null;

  return { kind: 'vue', styles, template };
}
