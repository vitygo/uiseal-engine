import fs from 'node:fs';
import path from 'node:path';
import type { Root } from 'postcss';
import { getParserForFile } from '../parsers/registry.js';
import { parseValue } from '../values/parse-value.js';
import type { DetectResult, SourceTokens, TokenSource } from './types.js';

const CANDIDATE_DIRS = ['', 'src', 'src/styles', 'src/css', 'styles', 'css'];
const CANDIDATE_NAMES = [
  'variables.css',
  'tokens.css',
  'vars.css',
  'theme.css',
  'global.css',
  'globals.css',
  'app.css',
  'index.css',
  '_variables.scss',
  '_tokens.scss',
];

// A file needs at least this many :root custom properties / SCSS $variables
// to be considered a real design-token source rather than incidental CSS.
const MIN_VARS = 3;

interface VarDecl {
  /** property/variable name with -- or $ stripped */
  name: string;
  value: string;
}

// :root { --foo: bar } custom properties AND top-level SCSS $variables are
// both treated as "variable declarations" — postcss-scss (via the registry's
// .scss parser) represents `$foo: bar;` as an ordinary Declaration, so a
// single walk handles both syntaxes uniformly.
function collectVarDecls(root: Root): VarDecl[] {
  const decls: VarDecl[] = [];
  root.walkRules(':root', (rule) => {
    rule.walkDecls(/^--/, (decl) => {
      decls.push({ name: decl.prop.replace(/^--/, ''), value: decl.value.trim() });
    });
  });
  root.walkDecls(/^\$/, (decl) => {
    decls.push({ name: decl.prop.replace(/^\$/, ''), value: decl.value.trim() });
  });
  return decls;
}

function parseFile(filePath: string): Root | null {
  const parser = getParserForFile(filePath);
  if (!parser) return null;
  try {
    const code = fs.readFileSync(filePath, 'utf8');
    const parsed = parser.parse(code, filePath);
    return parsed.kind === 'css' ? parsed.root : null;
  } catch {
    return null;
  }
}

function findBestFile(cwd: string): { file: string; decls: VarDecl[] } | null {
  let best: { file: string; decls: VarDecl[] } | null = null;

  for (const dir of CANDIDATE_DIRS) {
    for (const name of CANDIDATE_NAMES) {
      const candidate = path.join(cwd, dir, name);
      if (!fs.existsSync(candidate)) continue;

      const root = parseFile(candidate);
      if (!root) continue;

      const decls = collectVarDecls(root);
      if (decls.length >= MIN_VARS && (!best || decls.length > best.decls.length)) {
        best = { file: candidate, decls };
      }
    }
  }

  return best;
}

// Classification order:
//   1. parseValue(value, name) — this only resolves to a non-'unknown' kind
//      when the variable's stripped name literally matches a real CSS
//      property regex (e.g. --padding, --font-size, --border-radius), which
//      does happen in the wild but isn't the common case for semantic names.
//   2. A keyword heuristic on the variable's own name (color-ish names are
//      already caught by parseValue's value-content color detection, so this
//      step only needs radius/font-size/spacing keywords).
//   3. Otherwise: for a numeric value with no naming hint at all, SKIP it
//      rather than guessing from magnitude — an unlabeled ambiguous value is
//      more likely to be mis-bucketed than correctly guessed, and the user
//      can add it to the generated config by hand.
function classify(name: string, rawValue: string, tokens: SourceTokens): void {
  const parsed = parseValue(rawValue, name);

  if (parsed.kind === 'color') {
    tokens.colors[name] = rawValue;
    return;
  }
  if (parsed.value === null) return;

  if (parsed.kind === 'radius') {
    tokens.radii.push(parsed.value);
    return;
  }
  if (parsed.kind === 'fontSize') {
    tokens.fontSizes.push(parsed.value);
    return;
  }
  if (parsed.kind === 'spacing') {
    tokens.spacing.push(parsed.value);
    return;
  }

  const lower = name.toLowerCase();
  if (/radius|round|corner/.test(lower)) {
    tokens.radii.push(parsed.value);
  } else if (/font|text|fs|size/.test(lower)) {
    tokens.fontSizes.push(parsed.value);
  } else if (/space|spacing|gap|(^|[-_])sp([-_]|$)/.test(lower)) {
    tokens.spacing.push(parsed.value);
  }
  // else: ambiguous numeric value, no naming hint — skip (see doc comment above).
}

function dedupSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

export const cssVarsSource: TokenSource = {
  id: 'css-vars',
  label: 'CSS variables',

  async detect(cwd: string): Promise<DetectResult> {
    const best = findBestFile(cwd);
    if (!best) return { found: false, confidence: 0 };
    return { found: true, file: best.file, confidence: 0.8 };
  },

  async extract(cwd: string): Promise<SourceTokens> {
    const best = findBestFile(cwd);
    if (!best) {
      throw new Error(`No CSS/SCSS variable file found in ${cwd}`);
    }

    const tokens: SourceTokens = { colors: {}, spacing: [], fontSizes: [], fontFamilies: [], radii: [] };
    for (const { name, value } of best.decls) {
      classify(name, value, tokens);
    }

    tokens.spacing = dedupSorted(tokens.spacing);
    tokens.fontSizes = dedupSorted(tokens.fontSizes);
    tokens.radii = dedupSorted(tokens.radii);

    return tokens;
  },
};
