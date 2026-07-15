// Parses Tailwind utility class strings and extracts only the ARBITRARY
// VALUE classes ([...] escape-hatch syntax) — standard utilities (px-4,
// text-blue-500) are valid by definition (they resolve to a token already
// in the user's Tailwind config) and are never returned here.
import { parseValue, type DesignValue } from '../values/parse-value.js';

export type TailwindArbitraryCategory = 'spacing' | 'color' | 'fontSize' | 'radius' | 'other';

export interface TailwindArbitraryValue {
  /** full class text as written, including variant/important/negative prefixes: "md:hover:px-[13px]" */
  className: string;
  /** utility prefix with variants/!/- stripped: "px". Empty string for the arbitrary-property form ([padding:13px]). */
  utility: string;
  /** raw text inside the brackets (or after the ':' for the arbitrary-property form): "13px" */
  rawValue: string;
  designValue: DesignValue;
  category: TailwindArbitraryCategory;
  /** character offset of this class within the original classString */
  startIndex: number;
}

// Prefixes whose arbitrary bracket value is a length that maps onto the
// spacing scale (margin/padding/gap/inset/sizing) — from the task spec.
const SPACING_PREFIXES = new Set([
  'p', 'px', 'py', 'pt', 'pr', 'pb', 'pl',
  'm', 'mx', 'my', 'mt', 'mr', 'mb', 'ml',
  'gap', 'gap-x', 'gap-y',
  'space-x', 'space-y',
  'inset', 'inset-x', 'inset-y', 'top', 'right', 'bottom', 'left',
  'w', 'h', 'min-w', 'max-w', 'min-h', 'max-h',
]);

// Property names used inside the arbitrary-PROPERTY form, [property:value] —
// parseValue's own propertyHint regexes already recognize these directly.
const DYNAMIC_VALUE_RE = /\b(calc|var)\s*\(/i;

function isDynamicValue(raw: string): boolean {
  return DYNAMIC_VALUE_RE.test(raw);
}

// Strips variant prefixes (md:, hover:, dark:, ...) by finding the LAST ':'
// that sits outside any [...] span — arbitrary variants like
// [&:hover]:mt-[13px] and arbitrary properties like hover:[mask-type:luminance]
// both contain colons *inside* brackets that must not be mistaken for a
// variant separator.
function stripVariants(cls: string): string {
  let depth = 0;
  let lastColonOutside = -1;
  for (let i = 0; i < cls.length; i++) {
    const ch = cls[i];
    if (ch === '[') depth++;
    else if (ch === ']') depth = Math.max(0, depth - 1);
    else if (ch === ':' && depth === 0) lastColonOutside = i;
  }
  return lastColonOutside === -1 ? cls : cls.slice(lastColonOutside + 1);
}

function categorizeUtilityForm(utility: string, rawValue: string): {
  category: TailwindArbitraryCategory;
  designValue: DesignValue;
} {
  const designValue = parseValue(rawValue);

  if (/^rounded/.test(utility)) return { category: 'radius', designValue };
  if (SPACING_PREFIXES.has(utility)) return { category: 'spacing', designValue };
  if (designValue.kind === 'color') return { category: 'color', designValue };
  if (utility === 'text' && designValue.value !== null) return { category: 'fontSize', designValue };
  return { category: 'other', designValue };
}

function categorizePropertyForm(property: string, rawValue: string): {
  category: TailwindArbitraryCategory;
  designValue: DesignValue;
} {
  const designValue = parseValue(rawValue, property);
  const kindToCategory: Record<string, TailwindArbitraryCategory> = {
    color: 'color',
    spacing: 'spacing',
    radius: 'radius',
    fontSize: 'fontSize',
  };
  return { category: kindToCategory[designValue.kind] ?? 'other', designValue };
}

// Finds the bracket span starting at `from` (which must be the index of a
// '[') via depth counting, so a value that itself contains nested brackets
// doesn't terminate early at the first ']'.
function findBracketEnd(cls: string, from: number): number {
  let depth = 0;
  for (let i = from; i < cls.length; i++) {
    if (cls[i] === '[') depth++;
    else if (cls[i] === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function parseOneClass(cls: string): Omit<TailwindArbitraryValue, 'className' | 'startIndex'> | null {
  let working = stripVariants(cls);

  // Important modifier — leading '!' (Tailwind v3) or trailing '!' (v4).
  if (working.startsWith('!')) working = working.slice(1);
  if (working.endsWith('!')) working = working.slice(0, -1);

  const isNegative = working.startsWith('-');
  if (isNegative) working = working.slice(1);

  // Arbitrary PROPERTY form: the entire class is "[property:value]", no
  // utility prefix precedes the bracket.
  if (working.startsWith('[') && working.endsWith(']')) {
    const inner = working.slice(1, -1);
    const colonIdx = inner.indexOf(':');
    if (colonIdx === -1) return null; // malformed, nothing to extract
    const property = inner.slice(0, colonIdx).trim();
    const rawValue = inner.slice(colonIdx + 1).trim();
    if (!rawValue || isDynamicValue(rawValue)) return null;
    const { category, designValue } = categorizePropertyForm(property, rawValue);
    return { utility: '', rawValue, designValue, category };
  }

  const bracketStart = working.indexOf('[');
  if (bracketStart === -1) return null; // standard utility, not arbitrary

  const bracketEnd = findBracketEnd(working, bracketStart);
  if (bracketEnd === -1) return null; // unterminated, malformed

  const utility = working.slice(0, bracketStart).replace(/-$/, '');
  const rawValue = working.slice(bracketStart + 1, bracketEnd).trim();
  if (!rawValue || isDynamicValue(rawValue)) return null;

  const { category, designValue } = categorizeUtilityForm(utility, rawValue);
  return { utility, rawValue, designValue, category };
}

export function extractArbitraryValues(classString: string | null | undefined): TailwindArbitraryValue[] {
  if (!classString) return [];

  const results: TailwindArbitraryValue[] = [];
  const TOKEN_RE = /\S+/g;
  let match: RegExpExecArray | null;

  while ((match = TOKEN_RE.exec(classString)) !== null) {
    const cls = match[0];
    const parsed = parseOneClass(cls);
    if (!parsed) continue;
    results.push({ className: cls, startIndex: match.index, ...parsed });
  }

  return results;
}
