import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tailwindSource } from './tailwind.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uiseal-tailwind-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const CJS_CONFIG = `
module.exports = {
  theme: {
    colors: {
      blue: { 50: '#eff6ff', 500: '#3b82f6', 900: '#1e3a8a' },
      primary: '#02c39a',
      transparent: 'transparent',
      inherit: 'inherit',
      currentColor: 'currentColor',
      gray: { DEFAULT: '#888888', 100: '#eeeeee' },
    },
    spacing: {
      0: '0px',
      1: '0.25rem',
      2: '0.5rem',
      4: '1rem',
    },
    fontSize: {
      sm: ['0.875rem', { lineHeight: '1.25rem' }],
      base: '1rem',
      lg: '1.125rem',
    },
    borderRadius: {
      none: '0px',
      DEFAULT: '0.25rem',
      md: '0.375rem',
      full: '9999px',
    },
    fontFamily: {
      sans: ['Inter', 'sans-serif'],
      mono: ['JetBrains Mono', 'monospace'],
    },
  },
};
`;

describe('tailwindSource — detect', () => {
  it('finds tailwind.config.js in cwd', async () => {
    fs.writeFileSync(path.join(tmpDir, 'tailwind.config.js'), CJS_CONFIG);
    const result = await tailwindSource.detect(tmpDir);
    expect(result.found).toBe(true);
    expect(result.confidence).toBe(0.9);
    expect(result.file).toBe(path.join(tmpDir, 'tailwind.config.js'));
  });

  it('returns found: false when no config exists', async () => {
    const result = await tailwindSource.detect(tmpDir);
    expect(result.found).toBe(false);
  });
});

describe('tailwindSource — extract (CJS)', () => {
  it('flattens nested color scales, DEFAULT keys, and flat colors', async () => {
    fs.writeFileSync(path.join(tmpDir, 'tailwind.config.js'), CJS_CONFIG);
    const tokens = await tailwindSource.extract(tmpDir);

    expect(tokens.colors).toEqual({
      'blue-50': '#eff6ff',
      'blue-500': '#3b82f6',
      'blue-900': '#1e3a8a',
      primary: '#02c39a',
      gray: '#888888',
      'gray-100': '#eeeeee',
    });
  });

  it('skips transparent, inherit, and currentColor', async () => {
    fs.writeFileSync(path.join(tmpDir, 'tailwind.config.js'), CJS_CONFIG);
    const tokens = await tailwindSource.extract(tmpDir);

    expect(tokens.colors['transparent']).toBeUndefined();
    expect(tokens.colors['inherit']).toBeUndefined();
    expect(tokens.colors['currentColor']).toBeUndefined();
  });

  it('converts rem spacing to px at a 16px base, alongside raw px', async () => {
    fs.writeFileSync(path.join(tmpDir, 'tailwind.config.js'), CJS_CONFIG);
    const tokens = await tailwindSource.extract(tmpDir);

    expect(tokens.spacing).toEqual([0, 4, 8, 16]);
  });

  it('extracts the size from [size, options] font-size tuples', async () => {
    fs.writeFileSync(path.join(tmpDir, 'tailwind.config.js'), CJS_CONFIG);
    const tokens = await tailwindSource.extract(tmpDir);

    expect(tokens.fontSizes).toEqual([14, 16, 18]);
  });

  it('extracts border radii, including DEFAULT', async () => {
    fs.writeFileSync(path.join(tmpDir, 'tailwind.config.js'), CJS_CONFIG);
    const tokens = await tailwindSource.extract(tmpDir);

    expect(tokens.radii).toEqual([0, 4, 6, 9999]);
  });

  it('extracts the first font name from each fontFamily stack', async () => {
    fs.writeFileSync(path.join(tmpDir, 'tailwind.config.js'), CJS_CONFIG);
    const tokens = await tailwindSource.extract(tmpDir);

    expect(tokens.fontFamilies).toEqual(['Inter', 'JetBrains Mono']);
  });

  it('throws a helpful error when extract() is called with no config present', async () => {
    await expect(tailwindSource.extract(tmpDir)).rejects.toThrow(/No tailwind.config found/);
  });
});

describe('tailwindSource — theme.extend merging', () => {
  it('reads colors/spacing declared only under theme.extend', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'tailwind.config.js'),
      `module.exports = {
        theme: {
          extend: {
            colors: { brand: '#ff6600' },
            spacing: { 18: '4.5rem' },
          },
        },
      };`,
    );

    const tokens = await tailwindSource.extract(tmpDir);

    expect(tokens.colors).toEqual({ brand: '#ff6600' });
    expect(tokens.spacing).toEqual([72]);
  });

  it('lets theme.extend override a base theme value with the same key', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'tailwind.config.js'),
      `module.exports = {
        theme: {
          colors: { brand: '#000000' },
          extend: { colors: { brand: '#ff6600' } },
        },
      };`,
    );

    const tokens = await tailwindSource.extract(tmpDir);

    expect(tokens.colors).toEqual({ brand: '#ff6600' });
  });
});

describe('tailwindSource — ESM config (.mjs)', () => {
  it('extracts tokens from an export default config', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'tailwind.config.mjs'),
      `export default {
        theme: {
          colors: { primary: '#02c39a' },
          spacing: { 4: '1rem' },
        },
      };`,
    );

    const result = await tailwindSource.detect(tmpDir);
    expect(result.found).toBe(true);
    expect(result.file).toBe(path.join(tmpDir, 'tailwind.config.mjs'));

    const tokens = await tailwindSource.extract(tmpDir);
    expect(tokens.colors).toEqual({ primary: '#02c39a' });
    expect(tokens.spacing).toEqual([16]);
  });
});
