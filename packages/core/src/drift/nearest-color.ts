// A standalone nearest-color finder against a plain Record<name, hex> —
// config/helpers.ts's findClosestColorToken() does the same CIEDE2000
// comparison but requires a full uisealConfig object; drift compares
// against a live SourceTokens.colors record, not a loaded config, so
// wrapping it in a synthetic uisealConfig just to reuse that signature
// would be more awkward than duplicating this small, self-contained
// calculation (same threshold, same culori functions).
import { parse as parseColor, differenceCiede2000 } from 'culori';

// Colors within this many CIEDE2000 units are visually similar — same
// threshold as config/helpers.ts's COLOR_DISTANCE_THRESHOLD, for
// consistent "is this close enough to suggest" behavior everywhere.
const COLOR_DISTANCE_THRESHOLD = 10;

export interface NearestColorResult {
  name: string;
  hex: string;
  distance: number;
}

export function findNearestColorAgainst(
  hex: string,
  sourceColors: Record<string, string>,
): NearestColorResult | null {
  const delta = differenceCiede2000();
  const parsedInput = parseColor(hex);
  if (!parsedInput) return null;

  let closest: NearestColorResult | null = null;

  for (const [name, tokenValue] of Object.entries(sourceColors)) {
    const parsedToken = parseColor(tokenValue);
    if (!parsedToken) continue;
    const distance = delta(parsedInput, parsedToken);
    if (!closest || distance < closest.distance) {
      closest = { name, hex: tokenValue, distance };
    }
  }

  return closest && closest.distance <= COLOR_DISTANCE_THRESHOLD ? closest : null;
}
