import { describe, it, expect } from 'vitest';
import { toDriftJson, formatDriftJson } from './format-drift-json.js';
import type { DriftReport } from './analyze-drift.js';

function emptyCategory() {
  return { tokensInSource: 0, uniqueValuesInCode: 0, driftedValues: [], unusedTokens: [] };
}

function baseReport(): DriftReport {
  return {
    source: { id: 'css-vars', file: '/project/variables.css' },
    timestamp: '2026-01-01T00:00:00.000Z',
    summary: {
      filesScanned: 2,
      totalValueOccurrences: 6,
      totalTokensInSource: 5,
      totalUniqueValuesInCode: 4,
      totalDriftedValues: 2,
      totalUnusedTokens: 3,
      driftPercentage: 50,
    },
    categories: {
      colors: {
        ...emptyCategory(),
        driftedValues: [
          { value: '#1a73e8', occurrences: 3, files: [{ file: 'a.tsx', line: 1, column: 1 }] },
        ],
      },
      spacing: {
        ...emptyCategory(),
        driftedValues: [
          { value: '13px', nearestToken: '16px', occurrences: 8, files: [{ file: 'b.tsx', line: 2, column: 1 }] },
        ],
      },
      fontSizes: emptyCategory(),
      radii: emptyCategory(),
      fontFamilies: emptyCategory(),
    },
  };
}

describe('toDriftJson', () => {
  it('flattens driftedValues across categories, tagged with category, sorted by occurrences', () => {
    const json = toDriftJson(baseReport());
    expect(json.driftedValues).toHaveLength(2);
    expect(json.driftedValues[0]).toMatchObject({ category: 'spacing', value: '13px', occurrences: 8 });
    expect(json.driftedValues[1]).toMatchObject({ category: 'colors', value: '#1a73e8', occurrences: 3 });
  });

  it('preserves the original nested categories alongside the flattened list', () => {
    const json = toDriftJson(baseReport());
    expect(json.categories.colors.driftedValues).toHaveLength(1);
    expect(json.summary.driftPercentage).toBe(50);
  });
});

describe('formatDriftJson', () => {
  it('produces valid, parseable JSON that round-trips the report data', () => {
    const report = baseReport();
    const parsed = JSON.parse(formatDriftJson(report));

    expect(parsed.source).toEqual(report.source);
    expect(parsed.summary).toEqual(report.summary);
    expect(parsed.driftedValues).toHaveLength(2);
    expect(parsed.driftedValues[0].category).toBe('spacing');
  });

  it('is pretty-printed (indented) for readability, not minified', () => {
    const output = formatDriftJson(baseReport());
    expect(output).toContain('\n');
    expect(output).toContain('  "source"');
  });

  it('supports jq-style consumption: extracting summary.driftPercentage', () => {
    const parsed = JSON.parse(formatDriftJson(baseReport()));
    // Simulates `uiseal drift --json | jq '.summary.driftPercentage'`.
    expect(parsed.summary.driftPercentage).toBe(50);
  });
});
