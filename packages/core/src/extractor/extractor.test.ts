import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extract } from './index.js';
import { clusterColors } from './cluster.js';
import { emitConfigDraft } from './emit.js';
import { uisealConfigSchema } from '../config/schema.js';

const FIXTURE_CSS = readFileSync(
  resolve(import.meta.dirname, '../__fixtures__/extractor-fixture/styles.css'),
  'utf8',
);

const FILES = new Map([['styles.css', FIXTURE_CSS]]);

describe('extract()', () => {
  it('collects color usage counts normalized to lowercase hex', () => {
    const tokens = extract(FILES);
    // All three blues normalise to lowercase
    expect(tokens.colors.get('#3b82f6')).toBe(3);
    expect(tokens.colors.get('#3c82f7')).toBe(2);
    expect(tokens.colors.get('#3b83f6')).toBe(2);
    expect(tokens.colors.get('#ef4444')).toBe(2);
  });

  it('collects spacing px values', () => {
    const tokens = extract(FILES);
    expect(tokens.spacing.get(16)).toBe(2);
    expect(tokens.spacing.get(8)).toBe(2);
    expect(tokens.spacing.get(32)).toBe(1);
  });

  it('collects font sizes', () => {
    const tokens = extract(FILES);
    expect(tokens.fontSizes.get(14)).toBe(2);
    expect(tokens.fontSizes.get(24)).toBe(1);
  });

  it('collects font families (first token, no quotes)', () => {
    const tokens = extract(FILES);
    expect(tokens.fontFamilies.get('Inter')).toBe(1);
    expect(tokens.fontFamilies.has('sans-serif')).toBe(false);
  });

  it('collects border-radius px values', () => {
    const tokens = extract(FILES);
    expect(tokens.radii.get(4)).toBe(2);
    expect(tokens.radii.get(999)).toBe(1);
  });

  it('handles JSX inline styles and color attributes', () => {
    const jsx = `
      import React from 'react';
      export function Comp() {
        return (
          <div
            color="#FF0000"
            style={{ backgroundColor: '#0000FF', padding: '8px' }}
          />
        );
      }
    `;
    const tokens = extract(new Map([['comp.tsx', jsx]]));
    expect(tokens.colors.has('#ff0000')).toBe(true);
    expect(tokens.colors.has('#0000ff')).toBe(true);
    expect(tokens.spacing.has(8)).toBe(true);
  });
});

describe('clusterColors()', () => {
  it('clusters near-identical blues into one cluster, keeps red separate', () => {
    const tokens = extract(FILES);
    const clusters = clusterColors(tokens.colors);

    expect(clusters).toHaveLength(2);

    const blueCluster = clusters.find((c) => c.representative === '#3b82f6');
    expect(blueCluster).toBeDefined();
    expect(blueCluster!.members).toHaveLength(3);
    expect(blueCluster!.members).toContain('#3c82f7');
    expect(blueCluster!.members).toContain('#3b83f6');
    expect(blueCluster!.totalCount).toBe(7); // 3 + 2 + 2

    const redCluster = clusters.find((c) => c.representative === '#ef4444');
    expect(redCluster).toBeDefined();
    expect(redCluster!.members).toHaveLength(1);
    expect(redCluster!.totalCount).toBe(2);
  });

  it('sorts clusters by total usage descending', () => {
    const tokens = extract(FILES);
    const clusters = clusterColors(tokens.colors);
    // Blue cluster (7 total) before red cluster (2 total)
    expect(clusters[0]!.representative).toBe('#3b82f6');
    expect(clusters[1]!.representative).toBe('#ef4444');
  });

  it('respects a custom threshold — tight threshold keeps all colors separate', () => {
    const map = new Map([['#3b82f6', 1], ['#3c82f7', 1]]);
    const separated = clusterColors(map, 0);
    expect(separated).toHaveLength(2);
    const merged = clusterColors(map, 100);
    expect(merged).toHaveLength(1);
  });
});

describe('emitConfigDraft()', () => {
  it('emitted configObject validates against the Zod schema', () => {
    const tokens = extract(FILES);
    const clusters = clusterColors(tokens.colors);
    const result = emitConfigDraft(tokens, clusters);

    expect(() => uisealConfigSchema.parse(result.configObject)).not.toThrow();
  });

  it('maps clusters to --color-N tokens when no CSS vars exist', () => {
    const tokens = extract(FILES);
    const clusters = clusterColors(tokens.colors);
    const result = emitConfigDraft(tokens, clusters);

    expect(result.configObject.tokens.colors['--color-1']).toBe('#3b82f6');
    expect(result.configObject.tokens.colors['--color-2']).toBe('#ef4444');
  });

  it('filters spacing/fontSizes/radii to values appearing >= 2 times', () => {
    const tokens = extract(FILES);
    const clusters = clusterColors(tokens.colors);
    const result = emitConfigDraft(tokens, clusters);

    expect(result.configObject.tokens.spacing).toEqual([8, 16]);
    expect(result.configObject.tokens.fontSizes).toEqual([14]);
    expect(result.configObject.tokens.radii).toEqual([4]);
  });

  it('includes all font families regardless of count', () => {
    const tokens = extract(FILES);
    const clusters = clusterColors(tokens.colors);
    const result = emitConfigDraft(tokens, clusters);

    expect(result.configObject.tokens.fontFamilies).toContain('Inter');
  });

  it('sets all rules to warn', () => {
    const tokens = extract(FILES);
    const clusters = clusterColors(tokens.colors);
    const result = emitConfigDraft(tokens, clusters);

    const rules = Object.values(result.configObject.rules);
    expect(rules.every((r) => r === 'warn')).toBe(true);
  });

  it('sets wcag level to AA', () => {
    const tokens = extract(FILES);
    const clusters = clusterColors(tokens.colors);
    const result = emitConfigDraft(tokens, clusters);

    expect(result.configObject.wcag?.level).toBe('AA');
  });

  it('configSource contains color token comments with member counts', () => {
    const tokens = extract(FILES);
    const clusters = clusterColors(tokens.colors);
    const { configSource } = emitConfigDraft(tokens, clusters);

    expect(configSource).toContain("'--color-1': '#3b82f6'");
    expect(configSource).toContain('#3b82f6 (3x)');
    expect(configSource).toContain('#3c82f7 (2x)');
  });

  it('summary reports correct counts', () => {
    const tokens = extract(FILES);
    const clusters = clusterColors(tokens.colors);
    const { summary } = emitConfigDraft(tokens, clusters);

    expect(summary.uniqueColors).toBe(4); // 3 blues + 1 red
    expect(summary.colorClusters).toBe(2);
    expect(summary.spacingValues).toBe(2); // 8, 16
    expect(summary.fontSizeValues).toBe(1); // 14
    expect(summary.fontFamilies).toBe(1); // Inter
    expect(summary.radiiValues).toBe(1); // 4
  });

  it('uses real CSS var name from :root instead of --color-N', () => {
    const css = `:root { --c-blue: #3b82f6; }
.a { color: #3b82f6; }
.b { color: #3b82f6; }`;
    const tokens = extract(new Map([['styles.css', css]]));
    const clusters = clusterColors(tokens.colors);
    const result = emitConfigDraft(tokens, clusters);

    expect(result.configObject.tokens.colors['--c-blue']).toBe('#3b82f6');
    expect(result.configObject.tokens.colors['--color-1']).toBeUndefined();
    expect(result.configSource).toContain("'--c-blue': '#3b82f6'");
  });
});

describe('extract() — :root CSS custom properties', () => {
  it('builds cssVars map from :root declarations', () => {
    const css = `:root {
  --c-blue: #3b82f6;
  --c-red: #ef4444;
}`;
    const tokens = extract(new Map([['styles.css', css]]));
    expect(tokens.cssVars.get('#3b82f6')).toBe('--c-blue');
    expect(tokens.cssVars.get('#ef4444')).toBe('--c-red');
  });

  it('normalizes uppercase hex values in cssVars', () => {
    const css = ':root { --c-blue: #3B82F6; }';
    const tokens = extract(new Map([['styles.css', css]]));
    expect(tokens.cssVars.get('#3b82f6')).toBe('--c-blue');
  });

  it('ignores custom properties outside :root', () => {
    const css = '.btn { --c-blue: #3b82f6; }';
    const tokens = extract(new Map([['styles.css', css]]));
    expect(tokens.cssVars.size).toBe(0);
  });

  it('first definition wins when multiple vars share the same color', () => {
    const css = ':root { --alias: #3b82f6; --canonical: #3b82f6; }';
    const tokens = extract(new Map([['styles.css', css]]));
    expect(tokens.cssVars.get('#3b82f6')).toBe('--alias');
  });

  it('does not populate cssVars from JSX files', () => {
    const jsx = `export const styles = { '--c-blue': '#3b82f6' };`;
    const tokens = extract(new Map([['styles.tsx', jsx]]));
    expect(tokens.cssVars.size).toBe(0);
  });
});
