import { parse, differenceCiede2000, formatHex } from 'culori';
import type { uisealConfig } from './schema.js';

// Colors within 10 CIEDE2000 units are visually similar — likely a near-miss token value.
const COLOR_DISTANCE_THRESHOLD = 10;

const delta = differenceCiede2000();

export function findClosestColorToken(
  value: string,
  config: uisealConfig,
): string | null {
  const tokens = config.tokens.colors;

  // Normalize to lowercase hex for exact matching.
  const normalizedInput = normalizeColor(value);

  for (const [name, tokenValue] of Object.entries(tokens)) {
    if (normalizeColor(tokenValue) === normalizedInput) {
      return name;
    }
  }

  // No exact match — find the closest by perceptual distance.
  const parsedInput = parse(value);
  if (!parsedInput) return null;

  let closestName: string | null = null;
  let closestDistance = Infinity;

  for (const [name, tokenValue] of Object.entries(tokens)) {
    const parsedToken = parse(tokenValue);
    if (!parsedToken) continue;
    const d = delta(parsedInput, parsedToken);
    if (d < closestDistance) {
      closestDistance = d;
      closestName = name;
    }
  }

  return closestDistance <= COLOR_DISTANCE_THRESHOLD ? closestName : null;
}

export function isAllowedSpacing(value: number, config: uisealConfig): boolean {
  return config.tokens.spacing.includes(value);
}

export function isAllowedFontSize(value: number, config: uisealConfig): boolean {
  return config.tokens.fontSizes.includes(value);
}

export function isAllowedRadius(value: number, config: uisealConfig): boolean {
  return config.tokens.radii.includes(value);
}

export function isAllowedFontFamily(value: string, config: uisealConfig): boolean {
  return config.tokens.fontFamilies.includes(value);
}

function normalizeColor(value: string): string {
  const parsed = parse(value);
  if (!parsed) return value.toLowerCase().trim();
  return formatHex(parsed) ?? value.toLowerCase().trim();
}
