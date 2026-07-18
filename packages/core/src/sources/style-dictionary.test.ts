import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { styleDictionarySource } from './style-dictionary.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uiseal-style-dictionary-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Fixture 1 — DTCG format ($value/$type/$description), covers nested
// groups, type inheritance, an alias, and a rem dimension.
const DTCG_FIXTURE = {
  $type: 'color',
  color: {
    primary: { $value: '#02c39a' },
    danger: { $value: '#f87171' },
    neutral: {
      '100': { $value: '#f5f5f5' },
      '900': { $value: '#171717' },
    },
  },
  spacing: {
    $type: 'dimension',
    xs: { $value: '4px' },
    sm: { $value: '8px' },
    md: { $value: '12px' },
    lg: { $value: '16px' },
    xl: { $value: '24px' },
  },
  fontSize: {
    $type: 'dimension',
    sm: { $value: '14px' },
    base: { $value: '16px' },
    lg: { $value: '18px' },
  },
  borderRadius: {
    $type: 'dimension',
    sm: { $value: '4px' },
    md: { $value: '8px' },
    full: { $value: '9999px' },
  },
  fontFamily: {
    $type: 'fontFamily',
    sans: { $value: 'Inter, sans-serif' },
    mono: { $value: 'JetBrains Mono, monospace' },
  },
  'alias-test': {
    'button-bg': { $value: '{color.primary}', $type: 'color' },
  },
};

// Fixture 2 — Style Dictionary v3 format (plain value/type), same shape.
const SD_V3_FIXTURE = {
  type: 'color',
  color: {
    primary: { value: '#02c39a' },
    danger: { value: '#f87171' },
    neutral: {
      '100': { value: '#f5f5f5' },
      '900': { value: '#171717' },
    },
  },
  spacing: {
    type: 'dimension',
    xs: { value: '4px' },
    sm: { value: '8px' },
    md: { value: '12px' },
    lg: { value: '16px' },
    xl: { value: '24px' },
  },
  fontSize: {
    type: 'dimension',
    sm: { value: '14px' },
    base: { value: '16px' },
    lg: { value: '18px' },
  },
  borderRadius: {
    type: 'dimension',
    sm: { value: '4px' },
    md: { value: '8px' },
    full: { value: '9999px' },
  },
  fontFamily: {
    type: 'fontFamily',
    sans: { value: 'Inter, sans-serif' },
    mono: { value: 'JetBrains Mono, monospace' },
  },
  'alias-test': {
    'button-bg': { value: '{color.primary}', type: 'color' },
  },
};

function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function expectFixtureTokens(tokens: Awaited<ReturnType<typeof styleDictionarySource.extract>>): void {
  expect(tokens.colors).toEqual({
    'color-primary': '#02c39a',
    'color-danger': '#f87171',
    'color-neutral-100': '#f5f5f5',
    'color-neutral-900': '#171717',
    'alias-test-button-bg': '#02c39a',
  });
  expect(tokens.spacing).toEqual([4, 8, 12, 16, 24]);
  expect(tokens.fontSizes).toEqual([14, 16, 18]);
  expect(tokens.radii).toEqual([4, 8, 9999]);
  expect(tokens.fontFamilies).toEqual(['Inter, sans-serif', 'JetBrains Mono, monospace']);
}

describe('styleDictionarySource — detect', () => {
  it('returns found: false when no token files exist', async () => {
    const result = await styleDictionarySource.detect(tmpDir);
    expect(result.found).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it('finds tokens.json at the project root', async () => {
    writeJson(path.join(tmpDir, 'tokens.json'), DTCG_FIXTURE);
    const result = await styleDictionarySource.detect(tmpDir);
    expect(result.found).toBe(true);
    expect(result.confidence).toBe(0.85);
    expect(result.file).toBe(path.join(tmpDir, 'tokens.json'));
  });

  it('finds design-tokens.json', async () => {
    writeJson(path.join(tmpDir, 'design-tokens.json'), DTCG_FIXTURE);
    const result = await styleDictionarySource.detect(tmpDir);
    expect(result.found).toBe(true);
  });

  it('finds tokens.json inside src/', async () => {
    writeJson(path.join(tmpDir, 'src', 'tokens.json'), DTCG_FIXTURE);
    const result = await styleDictionarySource.detect(tmpDir);
    expect(result.found).toBe(true);
    expect(result.file).toBe(path.join(tmpDir, 'src', 'tokens.json'));
  });

  it('finds a *.tokens.json file', async () => {
    writeJson(path.join(tmpDir, 'color.tokens.json'), DTCG_FIXTURE);
    const result = await styleDictionarySource.detect(tmpDir);
    expect(result.found).toBe(true);
  });

  it('finds a tokens/ directory of *.json files', async () => {
    writeJson(path.join(tmpDir, 'tokens', 'color.json'), { color: DTCG_FIXTURE.color });
    writeJson(path.join(tmpDir, 'tokens', 'spacing.json'), { spacing: DTCG_FIXTURE.spacing });
    const result = await styleDictionarySource.detect(tmpDir);
    expect(result.found).toBe(true);
  });

  it('finds token files referenced by style-dictionary.config.json "source"', async () => {
    writeJson(path.join(tmpDir, 'design', 'colors.json'), { color: DTCG_FIXTURE.color });
    writeJson(path.join(tmpDir, 'style-dictionary.config.json'), { source: ['design/*.json'] });
    const result = await styleDictionarySource.detect(tmpDir);
    expect(result.found).toBe(true);
    expect(result.file).toBe(path.join(tmpDir, 'design', 'colors.json'));
  });

  it('returns false when style-dictionary.config.json has no matching source files', async () => {
    writeJson(path.join(tmpDir, 'style-dictionary.config.json'), { source: ['nope/*.json'] });
    const result = await styleDictionarySource.detect(tmpDir);
    expect(result.found).toBe(false);
  });
});

describe('styleDictionarySource — extract (DTCG format)', () => {
  it('produces the expected SourceTokens', async () => {
    writeJson(path.join(tmpDir, 'tokens.json'), DTCG_FIXTURE);
    const tokens = await styleDictionarySource.extract(tmpDir);
    expectFixtureTokens(tokens);
  });
});

describe('styleDictionarySource — extract (Style Dictionary v3 format)', () => {
  it('produces the same SourceTokens as the DTCG fixture (format-agnostic)', async () => {
    writeJson(path.join(tmpDir, 'tokens.json'), SD_V3_FIXTURE);
    const tokens = await styleDictionarySource.extract(tmpDir);
    expectFixtureTokens(tokens);
  });
});

describe('styleDictionarySource — type inheritance', () => {
  it('a child token without its own $type inherits the parent group $type', async () => {
    writeJson(path.join(tmpDir, 'tokens.json'), {
      color: { $type: 'color', primary: { $value: '#02c39a' } },
    });
    const tokens = await styleDictionarySource.extract(tmpDir);
    expect(tokens.colors).toEqual({ 'color-primary': '#02c39a' });
  });

  it("a token's own $type overrides the inherited group $type", async () => {
    writeJson(path.join(tmpDir, 'tokens.json'), {
      spacing: {
        $type: 'dimension',
        accent: { $value: '#ff0000', $type: 'color' },
      },
    });
    const tokens = await styleDictionarySource.extract(tmpDir);
    expect(tokens.colors).toEqual({ 'spacing-accent': '#ff0000' });
    expect(tokens.spacing).toEqual([]);
  });

  it('a token with no $type anywhere in its ancestry is skipped', async () => {
    writeJson(path.join(tmpDir, 'tokens.json'), {
      mystery: { primary: { $value: '#02c39a' } },
    });
    const tokens = await styleDictionarySource.extract(tmpDir);
    expect(tokens.colors).toEqual({});
  });
});

describe('styleDictionarySource — dimension heuristic', () => {
  it('categorizes by token path name: spacing, fontSize, radius, and default', async () => {
    writeJson(path.join(tmpDir, 'tokens.json'), {
      layout: {
        $type: 'dimension',
        gap: { $value: '8px' },
        margin: { $value: '16px' },
      },
      typography: {
        $type: 'dimension',
        'text-lg': { $value: '20px' },
        fs: { $value: '12px' },
      },
      shape: {
        $type: 'dimension',
        round: { $value: '4px' },
        corner: { $value: '6px' },
      },
      ambiguous: {
        $type: 'dimension',
        thing: { $value: '10px' },
      },
    });
    const tokens = await styleDictionarySource.extract(tmpDir);
    expect(tokens.spacing).toEqual([8, 10, 16]); // 'ambiguous-thing' defaults to spacing
    expect(tokens.fontSizes).toEqual([12, 20]);
    expect(tokens.radii).toEqual([4, 6]);
  });
});

describe('styleDictionarySource — alias resolution', () => {
  it('resolves a simple {group.token} reference', async () => {
    writeJson(path.join(tmpDir, 'tokens.json'), {
      color: {
        $type: 'color',
        primary: { $value: '#02c39a' },
        'button-bg': { $value: '{color.primary}' },
      },
    });
    const tokens = await styleDictionarySource.extract(tmpDir);
    expect(tokens.colors['color-button-bg']).toBe('#02c39a');
  });

  it('resolves a chained alias', async () => {
    writeJson(path.join(tmpDir, 'tokens.json'), {
      color: {
        $type: 'color',
        primary: { $value: '#02c39a' },
        secondary: { $value: '{color.primary}' },
        tertiary: { $value: '{color.secondary}' },
      },
    });
    const tokens = await styleDictionarySource.extract(tmpDir);
    expect(tokens.colors['color-tertiary']).toBe('#02c39a');
  });

  it('skips a circular reference rather than crashing', async () => {
    writeJson(path.join(tmpDir, 'tokens.json'), {
      color: {
        $type: 'color',
        a: { $value: '{color.b}' },
        b: { $value: '{color.a}' },
      },
    });
    const tokens = await styleDictionarySource.extract(tmpDir);
    expect(tokens.colors).toEqual({});
  });

  it('skips an alias that points nowhere', async () => {
    writeJson(path.join(tmpDir, 'tokens.json'), {
      color: { $type: 'color', a: { $value: '{color.does-not-exist}' } },
    });
    const tokens = await styleDictionarySource.extract(tmpDir);
    expect(tokens.colors).toEqual({});
  });
});

describe('styleDictionarySource — rem conversion', () => {
  it('converts a rem dimension value to px', async () => {
    writeJson(path.join(tmpDir, 'tokens.json'), {
      spacing: { $type: 'dimension', md: { $value: '0.75rem' } },
    });
    const tokens = await styleDictionarySource.extract(tmpDir);
    expect(tokens.spacing).toEqual([12]);
  });
});

describe('styleDictionarySource — malformed and empty input', () => {
  it('skips a token missing $value', async () => {
    writeJson(path.join(tmpDir, 'tokens.json'), {
      color: { $type: 'color', broken: { $type: 'color' } },
    });
    const tokens = await styleDictionarySource.extract(tmpDir);
    expect(tokens.colors).toEqual({});
  });

  it('returns empty SourceTokens for an empty token file, without crashing', async () => {
    writeJson(path.join(tmpDir, 'tokens.json'), {});
    const tokens = await styleDictionarySource.extract(tmpDir);
    expect(tokens).toEqual({ colors: {}, spacing: [], fontSizes: [], fontFamilies: [], radii: [] });
  });

  it('throws a helpful error when nothing is detected', async () => {
    await expect(styleDictionarySource.extract(tmpDir)).rejects.toThrow(/No design token file found/);
  });
});

describe('styleDictionarySource — multiple token files', () => {
  it('merges tokens/*.json files and resolves aliases across them', async () => {
    writeJson(path.join(tmpDir, 'tokens', 'color.json'), {
      color: { $type: 'color', primary: { $value: '#02c39a' } },
    });
    writeJson(path.join(tmpDir, 'tokens', 'component.json'), {
      button: { $type: 'color', bg: { $value: '{color.primary}' } },
    });
    const tokens = await styleDictionarySource.extract(tmpDir);
    expect(tokens.colors).toEqual({
      'color-primary': '#02c39a',
      'button-bg': '#02c39a',
    });
  });
});

describe('styleDictionarySource — skipped types', () => {
  it('skips fontWeight, duration, cubicBezier, and number types', async () => {
    writeJson(path.join(tmpDir, 'tokens.json'), {
      weight: { bold: { $value: 700, $type: 'fontWeight' } },
      motion: { fast: { $value: '150ms', $type: 'duration' } },
      easing: { standard: { $value: [0.4, 0, 0.2, 1], $type: 'cubicBezier' } },
      count: { max: { $value: 5, $type: 'number' } },
    });
    const tokens = await styleDictionarySource.extract(tmpDir);
    expect(tokens).toEqual({ colors: {}, spacing: [], fontSizes: [], fontFamilies: [], radii: [] });
  });
});
