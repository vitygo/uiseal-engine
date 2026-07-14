import { describe, it, expect } from 'vitest';
import { findNearestNumeric } from './nearest-token.js';

describe('findNearestNumeric', () => {
  it('returns an exact match with distance 0', () => {
    const r = findNearestNumeric(8, [4, 8, 16], { threshold: 4 });
    expect(r).toEqual({ value: 8, distance: 0, withinThreshold: true, tokenName: undefined });
  });

  it('returns the nearest value when within threshold', () => {
    const r = findNearestNumeric(10, [4, 8, 16], { threshold: 4 });
    expect(r).not.toBeNull();
    expect(r!.value).toBe(8);
    expect(r!.distance).toBe(2);
    expect(r!.withinThreshold).toBe(true);
  });

  it('reports withinThreshold: false when the nearest value is farther than the threshold', () => {
    const r = findNearestNumeric(30, [4, 8, 16], { threshold: 4 });
    expect(r).not.toBeNull();
    expect(r!.value).toBe(16);
    expect(r!.distance).toBe(14);
    expect(r!.withinThreshold).toBe(false);
  });

  it('returns null for an empty scale', () => {
    expect(findNearestNumeric(10, [], { threshold: 4 })).toBeNull();
  });

  it('returns null when the scale is below minScaleLength', () => {
    const r = findNearestNumeric(10, [4, 8], { threshold: 4, minScaleLength: 5 });
    expect(r).toBeNull();
  });

  it('does not gate on minScaleLength when the scale meets it exactly', () => {
    const r = findNearestNumeric(10, [4, 8, 16, 32, 48], { threshold: 4, minScaleLength: 5 });
    expect(r).not.toBeNull();
  });

  it('breaks ties by preferring the smaller value', () => {
    const r = findNearestNumeric(6, [4, 8], { threshold: 4 });
    expect(r).not.toBeNull();
    expect(r!.value).toBe(4);
    expect(r!.distance).toBe(2);
  });

  it('attaches a tokenName when tokenNames is provided', () => {
    const r = findNearestNumeric(8, [4, 8, 16], {
      threshold: 4,
      tokenNames: { 4: '--spacing-sm', 8: '--spacing-md', 16: '--spacing-lg' },
    });
    expect(r!.tokenName).toBe('--spacing-md');
  });

  it('leaves tokenName undefined when tokenNames is omitted', () => {
    const r = findNearestNumeric(8, [4, 8, 16], { threshold: 4 });
    expect(r!.tokenName).toBeUndefined();
  });

  it('leaves tokenName undefined when the nearest value has no entry in tokenNames', () => {
    const r = findNearestNumeric(8, [4, 8, 16], { threshold: 4, tokenNames: { 4: '--spacing-sm' } });
    expect(r!.tokenName).toBeUndefined();
  });
});
