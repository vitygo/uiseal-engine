// Single source of truth for file-type dispatch. To add a new file type,
// register a ParserEntry here — do not add ext checks elsewhere.
// To add a new value kind, extend parseValue() in ../values/parse-value.ts —
// do not regex values in rules.

import type { Root } from 'postcss';
import type { TSESTree } from '@typescript-eslint/types';
import { parseCss } from './css.js';
import { parseJsx } from './jsx.js';
import { parseScss } from './scss.js';
import { parseLess } from './less.js';
import { parseVue, type VueParsedFile } from './vue.js';
import { parseAngular, type AngularParsedFile } from './angular.js';

export type ParsedFile =
  | { kind: 'css'; root: Root }
  | { kind: 'jsx'; ast: TSESTree.Program }
  | VueParsedFile
  | AngularParsedFile;

export interface ParserEntry {
  id: string;
  /** lowercase extensions without a leading dot, e.g. ['tsx', 'jsx'] */
  extensions: string[];
  /**
   * Compound filename suffixes to match ADDITIONALLY to `extensions`, e.g.
   * ['component.ts', 'component.html'] — checked before falling back to a
   * plain single-extension match, so a bare .ts/.html file (not ending in
   * one of these suffixes) is correctly left unregistered. Needed because
   * `.ts`/`.html` aren't registered as bare extensions at all (that would
   * scan every TypeScript/HTML file in a project for zero benefit on
   * non-Angular files) — only the Angular naming convention is.
   */
  suffixes?: string[];
  parse(source: string, filePath: string): ParsedFile;
}

const registry: ParserEntry[] = [
  {
    id: 'jsx',
    extensions: ['tsx', 'jsx'],
    parse(source: string): ParsedFile {
      return { kind: 'jsx', ast: parseJsx(source) };
    },
  },
  {
    id: 'css',
    extensions: ['css'],
    parse(source: string): ParsedFile {
      return { kind: 'css', root: parseCss(source) };
    },
  },
  {
    id: 'scss',
    extensions: ['scss'],
    parse(source: string, filePath: string): ParsedFile {
      return { kind: 'css', root: parseScss(source, filePath) };
    },
  },
  {
    id: 'less',
    extensions: ['less'],
    parse(source: string, filePath: string): ParsedFile {
      return { kind: 'css', root: parseLess(source, filePath) };
    },
  },
  // Indented Sass (.sass) is a different syntax (no braces/semicolons) that
  // postcss-scss does not parse — it is intentionally NOT registered here.
  {
    id: 'vue',
    extensions: ['vue'],
    parse(source: string, filePath: string): ParsedFile {
      return parseVue(source, filePath);
    },
  },
  {
    id: 'angular',
    extensions: [],
    // Not a bare .ts extension — that would scan every TypeScript file in
    // a project for zero benefit on the (overwhelming majority of) files
    // that aren't Angular components.
    suffixes: ['component.ts'],
    parse(source: string): ParsedFile {
      return parseAngular(source);
    },
  },
  {
    id: 'angular-template',
    extensions: [],
    // A standalone external template referenced via templateUrl — not
    // resolved from the .component.ts side (see parsers/angular.ts), just
    // discovered directly by the glob like any other file. Its content IS
    // the whole template, so offset is always 0 (already-absolute
    // positions), unlike an inline `template: \`...\`` block.
    suffixes: ['component.html'],
    parse(source: string): ParsedFile {
      return { kind: 'angular', isComponent: true, styles: [], template: { content: source, offset: 0 } };
    },
  },
];

function extOf(filePath: string): string {
  return filePath.split('.').pop()?.toLowerCase() ?? '';
}

function matchesSuffix(filePath: string, suffix: string): boolean {
  return filePath.toLowerCase().endsWith(`.${suffix}`);
}

export function getParserForFile(filePath: string): ParserEntry | undefined {
  const suffixMatch = registry.find((entry) => entry.suffixes?.some((s) => matchesSuffix(filePath, s)));
  if (suffixMatch) return suffixMatch;

  const ext = extOf(filePath);
  return registry.find((entry) => entry.extensions.includes(ext));
}

export function supportedExtensions(): string[] {
  return registry.flatMap((entry) => entry.extensions);
}

function supportedSuffixes(): string[] {
  return registry.flatMap((entry) => entry.suffixes ?? []);
}

// CSS Modules (*.module.css, *.module.scss, *.module.less) already match
// their base extension above; the explicit module.* clauses are kept for
// readability/discoverability of the glob pattern and are a no-op for the
// matched file set.
export function buildGlob(): string {
  return `**/*.{${[...supportedExtensions(), ...supportedSuffixes()].join(',')},module.css,module.scss,module.less}`;
}
