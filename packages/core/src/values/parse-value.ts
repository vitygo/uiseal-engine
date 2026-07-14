// Canonical parser for raw CSS-ish design values (colors, lengths, font families).
// To add a new value kind, extend parseValue here — do not regex values in rules,
// the extractor, or analyzers.

export type DesignValueKind =
  | 'color'
  | 'spacing'
  | 'fontSize'
  | 'radius'
  | 'fontFamily'
  | 'unknown';

export interface DesignValue {
  kind: DesignValueKind;
  /** original text */
  raw: string;
  /** numeric part if applicable (px-normalized) */
  value: number | null;
  /** 'px' | 'rem' | '%' | null */
  unit: string | null;
  /** true if it's a var(--…) / token reference */
  isToken: boolean;
}

// Matches hex, rgb/rgba, hsl/hsla color literals. Built from one pattern so
// the boolean test (containsColorValue) and the extraction match
// (matchColorValues) can never drift apart.
const COLOR_PATTERN = '#[0-9a-fA-F]{3,8}\\b|rgba?\\s*\\([^)]+\\)|hsla?\\s*\\([^)]+\\)';
const COLOR_RE_TEST = new RegExp(COLOR_PATTERN, 'i');
const COLOR_RE_GLOBAL = new RegExp(COLOR_PATTERN, 'gi');

// Unanchored — matches a var(--…) reference anywhere in the string (e.g.
// inside linear-gradient(var(--x), #fff)).
const VAR_TOKEN_RE = /var\s*\(--/;

const SPACING_PROP_RE =
  /^(margin(-top|-right|-bottom|-left)?|padding(-top|-right|-bottom|-left)?|gap|row-gap|column-gap|top|left|right|bottom)$/;
const RADIUS_PROP_RE =
  /^border(-top-left|-top-right|-bottom-left|-bottom-right)?-radius$/;
const COLOR_PROP_RE =
  /^(color|background(-color|-image|-gradient|-attachment|-clip|-origin|-position|-repeat|-size)?|border(-top|-right|-bottom|-left)?(-color)?|fill|stroke|outline(-color|-style|-width|-offset)?)$/;

export function containsColorValue(raw: string): boolean {
  return COLOR_RE_TEST.test(raw);
}

export function matchColorValues(raw: string): string[] {
  return raw.match(COLOR_RE_GLOBAL) ?? [];
}

export function isVarToken(raw: string): boolean {
  return VAR_TOKEN_RE.test(raw);
}

function kindFromHint(hint?: string): DesignValueKind {
  if (!hint) return 'unknown';
  if (hint === 'font-size') return 'fontSize';
  if (hint === 'font-family') return 'fontFamily';
  if (RADIUS_PROP_RE.test(hint)) return 'radius';
  if (SPACING_PROP_RE.test(hint)) return 'spacing';
  if (COLOR_PROP_RE.test(hint)) return 'color';
  return 'unknown';
}

function parseNumeric(raw: string): { value: number; unit: string } | null {
  if (raw.endsWith('px')) {
    const num = parseFloat(raw);
    return isNaN(num) ? null : { value: num, unit: 'px' };
  }
  if (raw.endsWith('rem')) {
    const num = parseFloat(raw);
    return isNaN(num) ? null : { value: num * 16, unit: 'rem' };
  }
  if (raw.endsWith('%')) {
    const num = parseFloat(raw);
    return isNaN(num) ? null : { value: num, unit: '%' };
  }
  return null;
}

export function parseValue(raw: string, propertyHint?: string): DesignValue {
  const trimmed = raw.trim();
  const isToken = isVarToken(trimmed);

  if (containsColorValue(trimmed)) {
    return { kind: 'color', raw, value: null, unit: null, isToken };
  }

  const numeric = parseNumeric(trimmed);
  if (numeric) {
    return { kind: kindFromHint(propertyHint), raw, value: numeric.value, unit: numeric.unit, isToken };
  }

  if (isToken) {
    return { kind: kindFromHint(propertyHint), raw, value: null, unit: null, isToken };
  }

  if (propertyHint === 'font-family') {
    return { kind: 'fontFamily', raw, value: null, unit: null, isToken };
  }

  return { kind: 'unknown', raw, value: null, unit: null, isToken };
}
