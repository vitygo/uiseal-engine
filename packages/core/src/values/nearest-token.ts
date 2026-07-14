// Shared nearest-numeric-token search for spacing, font-size, and radius scales.
// Colors use a different (perceptual) distance metric — see config/helpers.ts.

export interface NearestResult {
  /** the closest scale value (px) */
  value: number;
  /** |input - value| */
  distance: number;
  withinThreshold: boolean;
  /** if tokens carry names, the matching name */
  tokenName?: string;
}

export interface FindNearestNumericOptions {
  threshold: number;
  minScaleLength?: number;
  tokenNames?: Record<number, string>;
}

export function findNearestNumeric(
  inputPx: number,
  scale: number[],
  opts: FindNearestNumericOptions,
): NearestResult | null {
  if (scale.length === 0) return null;
  if (opts.minScaleLength !== undefined && scale.length < opts.minScaleLength) return null;

  let nearest = scale[0]!;
  let nearestDist = Math.abs(inputPx - nearest);
  for (let i = 1; i < scale.length; i++) {
    const d = Math.abs(inputPx - scale[i]!);
    // Tie-break toward the smaller value for determinism.
    if (d < nearestDist || (d === nearestDist && scale[i]! < nearest)) {
      nearestDist = d;
      nearest = scale[i]!;
    }
  }

  return {
    value: nearest,
    distance: nearestDist,
    withinThreshold: nearestDist <= opts.threshold,
    tokenName: opts.tokenNames?.[nearest],
  };
}
