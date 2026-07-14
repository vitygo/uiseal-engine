import { describe, it, expect } from 'vitest';
import { parseValue, containsColorValue, matchColorValues, isVarToken } from './parse-value.js';

describe('parseValue — colors', () => {
  it('parses 3-digit hex', () => {
    const v = parseValue('#fff', 'color');
    expect(v.kind).toBe('color');
    expect(v.isToken).toBe(false);
  });

  it('parses 6-digit hex', () => {
    const v = parseValue('#ffffff', 'color');
    expect(v.kind).toBe('color');
  });

  it('parses rgb()', () => {
    const v = parseValue('rgb(255, 0, 0)', 'color');
    expect(v.kind).toBe('color');
  });

  it('parses rgba()', () => {
    const v = parseValue('rgba(255, 0, 0, 0.5)', 'color');
    expect(v.kind).toBe('color');
  });

  it('parses hsl()', () => {
    const v = parseValue('hsl(0, 100%, 50%)', 'color');
    expect(v.kind).toBe('color');
  });

  it('parses hsla()', () => {
    const v = parseValue('hsla(0, 100%, 50%, 0.5)', 'color');
    expect(v.kind).toBe('color');
  });

  it('does not treat plain keywords as colors', () => {
    const v = parseValue('currentColor', 'color');
    expect(v.kind).not.toBe('color');
  });
});

describe('parseValue — lengths', () => {
  it('parses 13px', () => {
    const v = parseValue('13px', 'margin');
    expect(v.value).toBe(13);
    expect(v.unit).toBe('px');
    expect(v.kind).toBe('spacing');
  });

  it('parses 1.5rem and normalizes to px', () => {
    const v = parseValue('1.5rem', 'font-size');
    expect(v.value).toBe(24);
    expect(v.unit).toBe('rem');
    expect(v.kind).toBe('fontSize');
  });

  it('parses 100%', () => {
    const v = parseValue('100%', 'margin');
    expect(v.value).toBe(100);
    expect(v.unit).toBe('%');
  });

  it('classifies radius properties', () => {
    const v = parseValue('4px', 'border-radius');
    expect(v.kind).toBe('radius');
    expect(v.value).toBe(4);
  });

  it('returns null value/unit for garbage', () => {
    const v = parseValue('garbage', 'margin');
    expect(v.value).toBeNull();
    expect(v.unit).toBeNull();
  });

  it('returns null value for a bare unit with no digits', () => {
    const v = parseValue('px', 'margin');
    expect(v.value).toBeNull();
  });
});

describe('parseValue — tokens', () => {
  it('detects var(--x) as a token', () => {
    const v = parseValue('var(--primary)', 'color');
    expect(v.isToken).toBe(true);
    expect(v.kind).toBe('color');
  });

  it('detects var() inside a larger value', () => {
    expect(isVarToken('linear-gradient(var(--x), #fff)')).toBe(true);
  });

  it('does not flag non-token values', () => {
    const v = parseValue('16px', 'margin');
    expect(v.isToken).toBe(false);
  });
});

describe('containsColorValue / matchColorValues', () => {
  it('detects a color literal is present', () => {
    expect(containsColorValue('#ff0000')).toBe(true);
    expect(containsColorValue('rgb(0,0,0)')).toBe(true);
    expect(containsColorValue('currentColor')).toBe(false);
  });

  it('extracts all color literals from a value', () => {
    expect(matchColorValues('linear-gradient(#fff, #000)')).toEqual(['#fff', '#000']);
  });

  it('returns an empty array when no colors are present', () => {
    expect(matchColorValues('16px')).toEqual([]);
  });
});
