// Style Dictionary (Salesforce, JSON/JSON5, value/type) and W3C DTCG
// (w3c.github.io/design-tokens, $value/$type/$description) are two names
// for converging formats — Style Dictionary v4 already accepts DTCG's
// $-prefixed keys. One walk handles both: at every node, prefer the
// $-prefixed key and fall back to the plain one, so no format flag or
// user config is ever needed.
import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import type { DetectResult, SourceTokens, TokenSource } from './types.js';

const CANDIDATE_DIRS = ['', 'src', 'tokens', 'design-tokens'];
const CANDIDATE_NAMES = ['tokens.json', 'tokens.json5', 'design-tokens.json'];
// Directories whose entire contents (any *.json file directly inside) count
// as token files — deliberately narrower than CANDIDATE_DIRS, which also
// includes 'src' and '' (root): slurping every .json in a project root or
// src/ would sweep in package.json, tsconfig.json, etc.
const TOKEN_DIRS = ['tokens', 'design-tokens'];
const CONFIG_NAME = 'style-dictionary.config.json';

type JsonObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readJson(filePath: string): unknown | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    // Malformed JSON, or a .json5-only file (comments/trailing commas) —
    // JSON5 isn't parsed (see README limitations); skip rather than crash.
    return null;
  }
}

async function resolveConfigSourceFiles(cwd: string): Promise<string[]> {
  const configPath = path.join(cwd, CONFIG_NAME);
  if (!fs.existsSync(configPath)) return [];

  const parsed = readJson(configPath);
  if (!isPlainObject(parsed)) return [];

  const source = parsed['source'];
  const patterns = Array.isArray(source)
    ? source.filter((s): s is string => typeof s === 'string')
    : typeof source === 'string'
      ? [source]
      : [];

  const files: string[] = [];
  for (const pattern of patterns) {
    try {
      files.push(...(await glob(pattern, { cwd, absolute: true, nodir: true })));
    } catch {
      // Bad glob pattern in a user's config — ignore rather than crash.
    }
  }
  return files;
}

async function findTokenFiles(cwd: string): Promise<string[]> {
  const found = new Set<string>();

  for (const dir of CANDIDATE_DIRS) {
    const dirPath = path.join(cwd, dir);
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) continue;

    for (const name of CANDIDATE_NAMES) {
      const candidate = path.join(dirPath, name);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) found.add(candidate);
    }

    for (const entry of fs.readdirSync(dirPath)) {
      if (entry.endsWith('.tokens.json')) {
        const candidate = path.join(dirPath, entry);
        if (fs.statSync(candidate).isFile()) found.add(candidate);
      }
    }
  }

  for (const dir of TOKEN_DIRS) {
    const dirPath = path.join(cwd, dir);
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) continue;
    for (const entry of fs.readdirSync(dirPath)) {
      if (!entry.endsWith('.json')) continue;
      const candidate = path.join(dirPath, entry);
      if (fs.statSync(candidate).isFile()) found.add(candidate);
    }
  }

  for (const file of await resolveConfigSourceFiles(cwd)) {
    found.add(file);
  }

  return [...found].sort();
}

// --- Token tree walking -----------------------------------------------

function hasValue(node: JsonObject): boolean {
  return '$value' in node || 'value' in node;
}

function getValue(node: JsonObject): unknown {
  return '$value' in node ? node['$value'] : node['value'];
}

function getType(node: JsonObject): string | undefined {
  const raw = '$type' in node ? node['$type'] : node['type'];
  return typeof raw === 'string' ? raw : undefined;
}

const ALIAS_RE = /^\{([^}]+)\}$/;

function getNodeAtPath(tree: JsonObject, pathParts: string[]): JsonObject | undefined {
  let cursor: unknown = tree;
  for (const part of pathParts) {
    if (!isPlainObject(cursor)) return undefined;
    cursor = cursor[part];
  }
  return isPlainObject(cursor) ? cursor : undefined;
}

// Resolves `{group.token}` alias references by dot-path lookup against the
// full (merged, multi-file) tree, following chained aliases. `visited`
// guards against circular references — a path revisited during resolution
// aborts with `undefined` (skip) rather than recursing forever.
function resolveValue(raw: unknown, tree: JsonObject, visited: Set<string>): unknown {
  if (typeof raw !== 'string') return raw;

  const match = ALIAS_RE.exec(raw.trim());
  if (!match) return raw;

  const refPath = match[1]!.split('.').map((s) => s.trim());
  const key = refPath.join('.');
  if (visited.has(key)) return undefined; // circular reference

  const node = getNodeAtPath(tree, refPath);
  if (!node || !hasValue(node)) return undefined; // unresolvable reference

  visited.add(key);
  return resolveValue(getValue(node), tree, visited);
}

function dimensionToPx(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (isPlainObject(value) && typeof value['value'] === 'number' && typeof value['unit'] === 'string') {
    return value['unit'] === 'rem' || value['unit'] === 'em' ? value['value'] * 16 : value['value'];
  }
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (trimmed.endsWith('rem') || trimmed.endsWith('em')) {
    const n = parseFloat(trimmed);
    return isNaN(n) ? null : n * 16;
  }
  if (trimmed.endsWith('px')) {
    const n = parseFloat(trimmed);
    return isNaN(n) ? null : n;
  }
  const n = parseFloat(trimmed);
  return isNaN(n) ? null : n;
}

// 'dimension' covers spacing, font size, AND radius in both formats —
// categorize by what the token's own path is named. Order matters: spacing
// keywords are checked first, then font/text-size keywords, then radius;
// an ambiguous dimension with none of these falls back to spacing.
function categorizeDimension(name: string): 'spacing' | 'fontSizes' | 'radii' {
  const lower = name.toLowerCase();
  if (/spacing|space|gap|margin|padding|inset/.test(lower)) return 'spacing';
  if (/font|text|fs|size/.test(lower)) return 'fontSizes';
  if (/radius|round|corner|border-radius/.test(lower)) return 'radii';
  return 'spacing';
}

function processToken(pathParts: string[], type: string | undefined, rawValue: unknown, tree: JsonObject, out: SourceTokens): void {
  if (!type) return;

  const resolved = resolveValue(rawValue, tree, new Set([pathParts.join('.')]));
  if (resolved === undefined) return;

  const name = pathParts.join('-');

  if (type === 'color') {
    if (typeof resolved === 'string') out.colors[name] = resolved;
    return;
  }

  if (type === 'dimension') {
    const px = dimensionToPx(resolved);
    if (px === null) return;
    out[categorizeDimension(name)].push(px);
    return;
  }

  if (type === 'fontFamily') {
    if (typeof resolved === 'string') out.fontFamilies.push(resolved);
    return;
  }

  // fontWeight, duration, cubicBezier, number, etc. — not a uiseal token category.
}

// A node with $value/value is a token; anything else is a group whose
// $type/type (if present) is inherited by every descendant that doesn't
// declare its own — DTCG's type-inheritance rule.
function walk(node: unknown, pathParts: string[], inheritedType: string | undefined, tree: JsonObject, out: SourceTokens): void {
  if (!isPlainObject(node)) return;

  if (hasValue(node)) {
    processToken(pathParts, getType(node) ?? inheritedType, getValue(node), tree, out);
    return;
  }

  const groupType = getType(node) ?? inheritedType;
  for (const [key, child] of Object.entries(node)) {
    if (key === '$type' || key === 'type' || key === '$description' || key === 'description') continue;
    walk(child, [...pathParts, key], groupType, tree, out);
  }
}

function dedupSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

export const styleDictionarySource: TokenSource = {
  id: 'tokens',
  label: 'Design tokens (Style Dictionary / W3C DTCG)',

  async detect(cwd: string): Promise<DetectResult> {
    const files = await findTokenFiles(cwd);
    if (files.length === 0) return { found: false, confidence: 0 };
    return { found: true, file: files[0], confidence: 0.85 };
  },

  async extract(cwd: string): Promise<SourceTokens> {
    const files = await findTokenFiles(cwd);
    if (files.length === 0) {
      throw new Error(`No design token file found in ${cwd}`);
    }

    // Shallow top-level merge across files (e.g. tokens/color.json +
    // tokens/spacing.json) so aliases can resolve across file boundaries.
    const tree: JsonObject = {};
    for (const file of files) {
      const parsed = readJson(file);
      if (isPlainObject(parsed)) Object.assign(tree, parsed);
    }

    const out: SourceTokens = { colors: {}, spacing: [], fontSizes: [], fontFamilies: [], radii: [] };
    walk(tree, [], undefined, tree, out);

    out.spacing = dedupSorted(out.spacing);
    out.fontSizes = dedupSorted(out.fontSizes);
    out.radii = dedupSorted(out.radii);
    out.fontFamilies = [...new Set(out.fontFamilies)];

    return out;
  },
};
