import { describe, it, expect } from 'vitest';
import { extractArbitraryValues } from './parse-classes.js';

describe('extractArbitraryValues — standard utilities are never returned', () => {
  it('returns empty for a plain standard utility', () => {
    expect(extractArbitraryValues('px-4')).toEqual([]);
  });

  it('returns empty for a mix of standard utilities', () => {
    expect(extractArbitraryValues('px-4 text-blue-500 mt-2 text-sm rounded-lg')).toEqual([]);
  });
});

describe('extractArbitraryValues — arbitrary value categories', () => {
  it('detects arbitrary spacing', () => {
    const [v] = extractArbitraryValues('px-[13px]');
    expect(v).toBeDefined();
    expect(v!.category).toBe('spacing');
    expect(v!.utility).toBe('px');
    expect(v!.rawValue).toBe('13px');
    expect(v!.designValue.value).toBe(13);
  });

  it('detects arbitrary color (hex)', () => {
    const [v] = extractArbitraryValues('text-[#ff5733]');
    expect(v!.category).toBe('color');
    expect(v!.utility).toBe('text');
    expect(v!.rawValue).toBe('#ff5733');
  });

  it('detects arbitrary color (rgb function)', () => {
    const [v] = extractArbitraryValues('bg-[rgb(255,0,0)]');
    expect(v!.category).toBe('color');
    expect(v!.utility).toBe('bg');
  });

  it('detects arbitrary font-size (numeric text-[...])', () => {
    const [v] = extractArbitraryValues('text-[15px]');
    expect(v!.category).toBe('fontSize');
    expect(v!.rawValue).toBe('15px');
  });

  it('detects arbitrary radius', () => {
    const [v] = extractArbitraryValues('rounded-[7px]');
    expect(v!.category).toBe('radius');
    expect(v!.rawValue).toBe('7px');
  });

  it('categorizes an unrecognized prefix as other', () => {
    const [v] = extractArbitraryValues('leading-[1.2]');
    expect(v!.category).toBe('other');
  });
});

describe('extractArbitraryValues — variant/state prefixes', () => {
  it('detects an arbitrary value behind a single variant', () => {
    const [v] = extractArbitraryValues('md:px-[13px]');
    expect(v!.category).toBe('spacing');
    expect(v!.utility).toBe('px');
    expect(v!.className).toBe('md:px-[13px]');
  });

  it('detects an arbitrary value behind stacked variants', () => {
    const [v] = extractArbitraryValues('md:hover:px-[13px]');
    expect(v!.category).toBe('spacing');
    expect(v!.utility).toBe('px');
  });

  it('detects a color arbitrary value behind a hover variant', () => {
    const [v] = extractArbitraryValues('hover:text-[#fff]');
    expect(v!.category).toBe('color');
  });

  it('does not mis-split an arbitrary variant selector containing a colon', () => {
    const [v] = extractArbitraryValues('[&:hover]:mt-[13px]');
    expect(v).toBeDefined();
    expect(v!.utility).toBe('mt');
    expect(v!.rawValue).toBe('13px');
    expect(v!.category).toBe('spacing');
  });
});

describe('extractArbitraryValues — dynamic values are skipped', () => {
  it('skips calc()', () => {
    expect(extractArbitraryValues('w-[calc(100%-20px)]')).toEqual([]);
  });

  it('skips var()', () => {
    expect(extractArbitraryValues('text-[var(--my-color)]')).toEqual([]);
  });
});

describe('extractArbitraryValues — arbitrary properties', () => {
  it('detects the [property:value] form with no utility prefix', () => {
    const [v] = extractArbitraryValues('[padding:13px]');
    expect(v).toBeDefined();
    expect(v!.utility).toBe('');
    expect(v!.rawValue).toBe('13px');
    expect(v!.category).toBe('spacing');
  });

  it('detects an arbitrary property behind a variant', () => {
    const [v] = extractArbitraryValues('hover:[mask-type:luminance]');
    expect(v).toBeDefined();
    expect(v!.utility).toBe('');
    expect(v!.rawValue).toBe('luminance');
  });

  it('categorizes an arbitrary color property', () => {
    const [v] = extractArbitraryValues('[color:#ff5733]');
    expect(v!.category).toBe('color');
  });
});

describe('extractArbitraryValues — modifiers', () => {
  it('strips the important modifier (leading !)', () => {
    const [v] = extractArbitraryValues('!px-[13px]');
    expect(v!.utility).toBe('px');
    expect(v!.rawValue).toBe('13px');
  });

  it('strips the important modifier (trailing !, v4 style)', () => {
    const [v] = extractArbitraryValues('px-[13px]!');
    expect(v!.utility).toBe('px');
    expect(v!.rawValue).toBe('13px');
  });

  it('detects a negative arbitrary spacing value', () => {
    const [v] = extractArbitraryValues('-mt-[5px]');
    expect(v).toBeDefined();
    expect(v!.utility).toBe('mt');
    expect(v!.category).toBe('spacing');
  });

  it('ignores the opacity modifier suffix after the bracket', () => {
    const [v] = extractArbitraryValues('bg-[#ff0000]/50');
    expect(v!.rawValue).toBe('#ff0000');
    expect(v!.category).toBe('color');
  });

  it('does not treat a slash inside the brackets as an opacity modifier', () => {
    const [v] = extractArbitraryValues('aspect-[16/9]');
    expect(v).toBeDefined();
    expect(v!.rawValue).toBe('16/9');
  });
});

describe('extractArbitraryValues — multiple classes in one string', () => {
  it('extracts only the arbitrary classes, in order, with correct positions', () => {
    const classString = 'px-4 mt-[13px] text-blue-500 bg-[#fff]';
    const values = extractArbitraryValues(classString);
    expect(values).toHaveLength(2);
    expect(values[0]!.className).toBe('mt-[13px]');
    expect(values[0]!.startIndex).toBe(classString.indexOf('mt-[13px]'));
    expect(values[1]!.className).toBe('bg-[#fff]');
    expect(values[1]!.startIndex).toBe(classString.indexOf('bg-[#fff]'));
  });

  it('handles multi-line class strings and whitespace correctly', () => {
    const classString = 'px-4\n  mt-[13px]\n  text-blue-500';
    const values = extractArbitraryValues(classString);
    expect(values).toHaveLength(1);
    expect(values[0]!.startIndex).toBe(classString.indexOf('mt-[13px]'));
  });
});

describe('extractArbitraryValues — empty/invalid input', () => {
  it('returns empty for an empty string', () => {
    expect(extractArbitraryValues('')).toEqual([]);
  });

  it('returns empty for null', () => {
    expect(extractArbitraryValues(null)).toEqual([]);
  });

  it('returns empty for undefined', () => {
    expect(extractArbitraryValues(undefined)).toEqual([]);
  });

  it('does not crash on a malformed unterminated bracket', () => {
    expect(() => extractArbitraryValues('px-[13px')).not.toThrow();
  });
});
