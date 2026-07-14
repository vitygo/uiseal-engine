import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DetectResult, SourceTokens, TokenSource } from './types.js';

// Priority order when multiple config files exist — plain JS/CJS first
// since they need no transpilation; .ts is best-effort (see extractConfig).
const CONFIG_NAMES = [
  'tailwind.config.js',
  'tailwind.config.cjs',
  'tailwind.config.mjs',
  'tailwind.config.ts',
];

const SKIPPED_COLOR_KEYS = new Set(['transparent', 'inherit', 'current', 'currentColor']);

function findConfigFile(cwd: string): string | null {
  for (const name of CONFIG_NAMES) {
    const candidate = path.join(cwd, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

// Approach A (static extraction): dynamically import the user's config
// directly rather than requiring `tailwindcss` to be installed to resolve
// it. Node's dynamic import() transparently handles both a CJS
// `module.exports = {...}` file and an ESM `export default {...}` file, so
// .js/.cjs/.mjs all load the same way. .ts is best-effort: it only works if
// the running Node (or a registered loader) can handle TS syntax — there's
// no bundling of imports/plugins/presets here, so a config that pulls in
// other modules may not fully resolve. This intentionally does not attempt
// to replicate Tailwind's own default-theme + preset resolution (that would
// require Approach B: `tailwindcss/resolveConfig`, which needs tailwindcss
// installed in the user's project) — only `theme` / `theme.extend` as
// written in the user's own config are read.
async function loadConfigModule(configPath: string): Promise<Record<string, unknown>> {
  const mod = (await import(pathToFileURL(configPath).href)) as {
    default?: unknown;
    [key: string]: unknown;
  };
  const value = (mod.default ?? mod) as Record<string, unknown>;
  return value;
}

function mergeThemeSection(theme: Record<string, unknown>, key: string): unknown {
  const base = theme[key];
  const extendTheme = theme['extend'] as Record<string, unknown> | undefined;
  const extend = extendTheme?.[key];

  if (base && typeof base === 'object' && extend && typeof extend === 'object') {
    return { ...(base as Record<string, unknown>), ...(extend as Record<string, unknown>) };
  }
  return extend ?? base;
}

function tailwindValueToPx(raw: unknown): number | null {
  if (typeof raw === 'number') return raw;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.endsWith('rem') || trimmed.endsWith('em')) {
    const n = parseFloat(trimmed);
    return isNaN(n) ? null : n * 16; // standard Tailwind 16px root font-size
  }
  if (trimmed.endsWith('px')) {
    const n = parseFloat(trimmed);
    return isNaN(n) ? null : n;
  }
  const n = parseFloat(trimmed);
  return isNaN(n) ? null : n;
}

function flattenColors(section: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  if (!section || typeof section !== 'object') return out;

  for (const [key, value] of Object.entries(section as Record<string, unknown>)) {
    if (SKIPPED_COLOR_KEYS.has(key)) continue;
    const name = prefix ? `${prefix}-${key}` : key;

    if (typeof value === 'string') {
      out[name] = value;
    } else if (value && typeof value === 'object') {
      const shades = value as Record<string, unknown>;
      for (const [shade, shadeValue] of Object.entries(shades)) {
        if (typeof shadeValue !== 'string') continue;
        out[shade === 'DEFAULT' ? name : `${name}-${shade}`] = shadeValue;
      }
    }
  }

  return out;
}

function flattenNumeric(section: unknown): number[] {
  if (!section || typeof section !== 'object') return [];
  const values = new Set<number>();
  for (const raw of Object.values(section as Record<string, unknown>)) {
    const px = tailwindValueToPx(raw);
    if (px !== null) values.add(px);
  }
  return [...values].sort((a, b) => a - b);
}

// theme.fontSize entries can be a plain string ('1rem') or a tuple
// [size, { lineHeight, letterSpacing }] — only the size is a token value.
function flattenFontSize(section: unknown): number[] {
  if (!section || typeof section !== 'object') return [];
  const values = new Set<number>();
  for (const raw of Object.values(section as Record<string, unknown>)) {
    const sizeRaw = Array.isArray(raw) ? raw[0] : raw;
    const px = tailwindValueToPx(sizeRaw);
    if (px !== null) values.add(px);
  }
  return [...values].sort((a, b) => a - b);
}

// theme.fontFamily entries can be a comma string or an array of font names
// (with generic fallbacks like 'sans-serif') — only the first entry is the
// actual family name.
function flattenFontFamily(section: unknown): string[] {
  if (!section || typeof section !== 'object') return [];
  const names: string[] = [];
  for (const raw of Object.values(section as Record<string, unknown>)) {
    let first: unknown = raw;
    if (Array.isArray(raw)) first = raw[0];
    else if (typeof raw === 'string') first = raw.split(',')[0];
    if (typeof first === 'string') {
      const trimmed = first.trim().replace(/^['"]|['"]$/g, '');
      if (trimmed) names.push(trimmed);
    }
  }
  return names;
}

export const tailwindSource: TokenSource = {
  id: 'tailwind',
  label: 'Tailwind CSS config',

  async detect(cwd: string): Promise<DetectResult> {
    const file = findConfigFile(cwd);
    if (!file) return { found: false, confidence: 0 };
    return { found: true, file, confidence: 0.9 };
  },

  async extract(cwd: string): Promise<SourceTokens> {
    const file = findConfigFile(cwd);
    if (!file) {
      throw new Error(`No tailwind.config found in ${cwd}`);
    }

    const config = await loadConfigModule(file);
    const theme = (config['theme'] as Record<string, unknown>) ?? {};

    return {
      colors: flattenColors(mergeThemeSection(theme, 'colors')),
      spacing: flattenNumeric(mergeThemeSection(theme, 'spacing')),
      fontSizes: flattenFontSize(mergeThemeSection(theme, 'fontSize')),
      fontFamilies: flattenFontFamily(mergeThemeSection(theme, 'fontFamily')),
      radii: flattenNumeric(mergeThemeSection(theme, 'borderRadius')),
    };
  },
};
