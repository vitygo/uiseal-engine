import { describe, it, expect } from 'vitest';
import { formatDriftReport } from './format-drift.js';
import type { DriftReport } from './analyze-drift.js';

function emptyCategory(overrides: Partial<DriftReport['categories']['colors']> = {}) {
  return { tokensInSource: 0, uniqueValuesInCode: 0, driftedValues: [], unusedTokens: [], ...overrides };
}

function baseReport(overrides: Partial<DriftReport> = {}): DriftReport {
  return {
    source: { id: 'css-vars', file: '/project/variables.css' },
    timestamp: '2026-01-01T00:00:00.000Z',
    summary: {
      filesScanned: 3,
      totalValueOccurrences: 7,
      totalTokensInSource: 6,
      totalUniqueValuesInCode: 5,
      totalDriftedValues: 3,
      totalUnusedTokens: 4,
      driftPercentage: 60,
    },
    categories: {
      colors: emptyCategory(),
      spacing: emptyCategory(),
      fontSizes: emptyCategory(),
      radii: emptyCategory(),
      fontFamilies: emptyCategory(),
      ...overrides.categories,
    },
    ...overrides,
  };
}

// Strips ANSI escape codes so assertions can check visible content/alignment
// without depending on exact color codes.
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('formatDriftReport — structure', () => {
  it('includes the headline percentage and box header', () => {
    const output = stripAnsi(formatDriftReport(baseReport()));
    expect(output).toContain('DESIGN SYSTEM DRIFT REPORT');
    expect(output).toContain('DRIFT: 60.0%');
    expect(output).toContain('(3 off-token values / 5 unique values)');
  });

  it('renders a well-formed table with aligned column borders', () => {
    const output = stripAnsi(formatDriftReport(baseReport()));
    const allLines = output.split('\n');
    const start = allLines.findIndex((l) => l.startsWith('┌'));
    const end = allLines.findIndex((l) => l.startsWith('└'));
    const tableLines = allLines.slice(start, end + 1);
    expect(tableLines.length).toBeGreaterThan(2);
    const widths = new Set(tableLines.map((l) => l.length));
    // Every row in the table (border + header + data) must be the same total width.
    expect(widths.size).toBe(1);
  });

  it('omits the TOP DRIFTED VALUES section when nothing drifted', () => {
    const output = formatDriftReport(baseReport({
      summary: { ...baseReport().summary, totalDriftedValues: 0 },
    }));
    expect(output).not.toContain('TOP DRIFTED VALUES');
  });

  it('omits the UNUSED TOKENS section when nothing is unused', () => {
    const output = formatDriftReport(baseReport());
    expect(output).not.toContain('UNUSED TOKENS');
  });
});

describe('formatDriftReport — drifted values and unused tokens', () => {
  const reportWithDrift = baseReport({
    categories: {
      colors: emptyCategory({
        tokensInSource: 3,
        uniqueValuesInCode: 2,
        driftedValues: [
          {
            value: '#1a73e8',
            nearestToken: 'color-primary (#3b82f6)',
            occurrences: 5,
            files: [
              { file: 'a.tsx', line: 1, column: 1 },
              { file: 'b.tsx', line: 2, column: 1 },
            ],
          },
        ],
        unusedTokens: ['color-danger'],
      }),
      spacing: emptyCategory({
        tokensInSource: 3,
        uniqueValuesInCode: 1,
        driftedValues: [
          { value: '13px', nearestToken: '16px', occurrences: 2, files: [{ file: 'a.tsx', line: 3, column: 1 }] },
        ],
        unusedTokens: [8, 24],
      }),
      fontSizes: emptyCategory(),
      radii: emptyCategory(),
      fontFamilies: emptyCategory(),
    },
  });

  it('lists drifted values sorted by occurrence count, with nearest-token suggestions', () => {
    const output = stripAnsi(formatDriftReport(reportWithDrift));
    expect(output).toContain('#1a73e8');
    expect(output).toContain('(not in tokens)');
    expect(output).toContain('5 occurrences in 2 files');
    expect(output).toContain('→ nearest: color-primary (#3b82f6)');

    expect(output).toContain('13px');
    expect(output).toContain('→ nearest: 16px');
    expect(output).toContain('Δ3px');

    // #1a73e8 (5 occurrences) must appear before 13px (2 occurrences).
    expect(output.indexOf('#1a73e8')).toBeLessThan(output.indexOf('13px'));
  });

  it('lists unused tokens grouped by category', () => {
    const output = stripAnsi(formatDriftReport(reportWithDrift));
    expect(output).toContain('UNUSED TOKENS');
    expect(output).toContain('colors: color-danger');
    expect(output).toContain('spacing: 8px, 24px');
  });

  it('truncates to top N by default and shows a "more" hint', () => {
    const many = emptyCategory({
      uniqueValuesInCode: 15,
      driftedValues: Array.from({ length: 15 }, (_, i) => ({
        value: `${i}px`,
        occurrences: 15 - i,
        files: [{ file: 'a.tsx', line: 1, column: 1 }],
      })),
    });
    const report = baseReport({
      categories: { colors: emptyCategory(), spacing: many, fontSizes: emptyCategory(), radii: emptyCategory(), fontFamilies: emptyCategory() },
    });
    const output = stripAnsi(formatDriftReport(report));
    expect(output).toContain('more (--verbose to show all)');
  });

  it('shows every drifted value when verbose is set', () => {
    const many = emptyCategory({
      uniqueValuesInCode: 15,
      driftedValues: Array.from({ length: 15 }, (_, i) => ({
        value: `${i}px`,
        occurrences: 15 - i,
        files: [{ file: 'a.tsx', line: 1, column: 1 }],
      })),
    });
    const report = baseReport({
      categories: { colors: emptyCategory(), spacing: many, fontSizes: emptyCategory(), radii: emptyCategory(), fontFamilies: emptyCategory() },
    });
    const output = stripAnsi(formatDriftReport(report, { verbose: true }));
    expect(output).not.toContain('more (--verbose to show all)');
    expect(output).toContain('14px');
  });
});
