import { describe, expect, it } from 'vitest';
import { uisealConfigSchema } from './schema.js';
import { findClosestColorToken } from './helpers.js';
import type { uisealConfig } from './schema.js';

const VALID_CONFIG = {
  tokens: {
    colors: { primary: '#1a73e8', danger: '#d93025' },
    spacing: [4, 8, 16, 24, 32],
    fontSizes: [12, 14, 16, 20, 24],
    fontFamilies: ['Inter', 'monospace'],
    radii: [2, 4, 8],
  },
  rules: {
    'color/no-raw-hex': 'error',
    'spacing/use-token': 'warn',
  },
  wcag: { level: 'AA' },
} as const;

describe('uisealConfigSchema', () => {
  it('accepts a valid config', () => {
    const result = uisealConfigSchema.safeParse(VALID_CONFIG);
    expect(result.success).toBe(true);
  });

  it('applies the default empty array for ignore', () => {
    const result = uisealConfigSchema.safeParse(VALID_CONFIG);
    expect(result.success && result.data.ignore).toEqual([
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/*.min.css',
    ]);
  });

  it('preserves ignore when provided', () => {
    const result = uisealConfigSchema.safeParse({ ...VALID_CONFIG, ignore: ['**/fixtures/**'] });
    expect(result.success && result.data.ignore).toEqual(['**/fixtures/**']);
  });

  it('rejects a config missing tokens.colors and reports the field', () => {
    const bad = {
      ...VALID_CONFIG,
      tokens: { ...VALID_CONFIG.tokens, colors: 'not-an-object' },
    };
    const result = uisealConfigSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths.some((p) => p.startsWith('tokens.colors'))).toBe(true);
    }
  });

  it('rejects an invalid rule severity and names the field', () => {
    const bad = {
      ...VALID_CONFIG,
      rules: { 'color/no-raw-hex': 'invalid-severity' },
    };
    const result = uisealConfigSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths.some((p) => p.includes('rules'))).toBe(true);
    }
  });

  it('rejects an invalid wcag level', () => {
    const bad = { ...VALID_CONFIG, wcag: { level: 'A' } };
    const result = uisealConfigSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths.some((p) => p.includes('wcag.level'))).toBe(true);
    }
  });

  describe('baseline.path validation', () => {
    it('accepts a normal relative baseline path', () => {
      const result = uisealConfigSchema.safeParse({
        ...VALID_CONFIG,
        baseline: { enabled: false, path: '.uiseal-baseline.json' },
      });
      expect(result.success).toBe(true);
    });

    it('accepts a relative path in a subdirectory', () => {
      const result = uisealConfigSchema.safeParse({
        ...VALID_CONFIG,
        baseline: { enabled: false, path: 'config/baseline.json' },
      });
      expect(result.success).toBe(true);
    });

    it('rejects a path traversal attempt using ..', () => {
      const result = uisealConfigSchema.safeParse({
        ...VALID_CONFIG,
        baseline: { enabled: false, path: '../../escape.json' },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes("'..'")));
      }
    });

    it('rejects an absolute path on Unix-style systems', () => {
      const result = uisealConfigSchema.safeParse({
        ...VALID_CONFIG,
        baseline: { enabled: false, path: '/tmp/evil.json' },
      });
      expect(result.success).toBe(false);
    });

    it('applies the default safe path when baseline is omitted', () => {
      const result = uisealConfigSchema.safeParse(VALID_CONFIG);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.baseline.path).toBe('.uiseal-baseline.json');
      }
    });
  });
});

describe('findClosestColorToken', () => {
  const config = uisealConfigSchema.parse(VALID_CONFIG) as uisealConfig;

  it('returns the token name on exact hex match', () => {
    expect(findClosestColorToken('#1a73e8', config)).toBe('primary');
  });

  it('returns the token name for a near-miss hex (one digit off)', () => {
    // #1a73e9 differs from #1a73e8 by a single step — well within threshold.
    expect(findClosestColorToken('#1a73e9', config)).toBe('primary');
  });

  it('returns null for a color far from any token', () => {
    // Bright yellow is nowhere near the primary blue or danger red.
    expect(findClosestColorToken('#ffff00', config)).toBeNull();
  });

  it('is case-insensitive for exact matches', () => {
    expect(findClosestColorToken('#1A73E8', config)).toBe('primary');
  });
});
