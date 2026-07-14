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

export type ParsedFile =
  | { kind: 'css'; root: Root }
  | { kind: 'jsx'; ast: TSESTree.Program };

export interface ParserEntry {
  id: string;
  /** lowercase extensions without a leading dot, e.g. ['tsx', 'jsx'] */
  extensions: string[];
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
];

function extOf(filePath: string): string {
  return filePath.split('.').pop()?.toLowerCase() ?? '';
}

export function getParserForFile(filePath: string): ParserEntry | undefined {
  const ext = extOf(filePath);
  return registry.find((entry) => entry.extensions.includes(ext));
}

export function supportedExtensions(): string[] {
  return registry.flatMap((entry) => entry.extensions);
}

// CSS Modules (*.module.css, *.module.scss, *.module.less) already match
// their base extension above; the explicit module.* clauses are kept for
// readability/discoverability of the glob pattern and are a no-op for the
// matched file set.
export function buildGlob(): string {
  return `**/*.{${supportedExtensions().join(',')},module.css,module.scss,module.less}`;
}
