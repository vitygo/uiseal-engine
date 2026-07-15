import path from 'node:path';
import type { DriftReport, DriftCategory, DriftedValue } from './analyze-drift.js';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';

function relativeToCwd(file: string): string {
  const rel = path.relative(process.cwd(), file);
  return rel.startsWith('..') ? file : rel;
}

function bold(s: string): string { return BOLD + s + RESET; }
function dim(s: string): string { return DIM + s + RESET; }
function red(s: string): string { return RED + s + RESET; }
function yellow(s: string): string { return YELLOW + s + RESET; }
function green(s: string): string { return GREEN + s + RESET; }

const CATEGORY_ORDER = ['colors', 'spacing', 'fontSizes', 'radii', 'fontFamilies'] as const;
const CATEGORY_LABEL: Record<(typeof CATEGORY_ORDER)[number], string> = {
  colors: 'Colors',
  spacing: 'Spacing',
  fontSizes: 'Font sizes',
  radii: 'Radii',
  fontFamilies: 'Fonts',
};
// What a drifted value in this category is "not in", for the top-drifted-
// values list ("13px (not in spacing)").
const CATEGORY_NOUN: Record<(typeof CATEGORY_ORDER)[number], string> = {
  colors: 'tokens',
  spacing: 'spacing',
  fontSizes: 'fontSizes',
  radii: 'radii',
  fontFamilies: 'fonts',
};

const SOURCE_LABEL: Record<string, string> = {
  tailwind: 'Tailwind CSS config',
  'css-vars': 'CSS variables',
  'code-scan': 'Scanned code (no design-token source detected)',
};

// A category's own drift ratio (driftedValues / uniqueValuesInCode) maps to
// 0-3 dots — a scale-invariant severity indicator (raw counts alone don't
// compare fairly across categories with very different value counts).
function driftDotCount(category: DriftCategory): number {
  if (category.uniqueValuesInCode === 0 || category.driftedValues.length === 0) return 0;
  const ratio = category.driftedValues.length / category.uniqueValuesInCode;
  return ratio >= 0.35 ? 3 : ratio >= 0.15 ? 2 : 1;
}

// Pads against the PLAIN (un-colored) text width — ANSI escape codes are
// zero-width when rendered but count toward .length, so padding must be
// computed before any color codes are inserted, not after.
function cell(text: string, width: number, align: 'left' | 'right'): string {
  const inner = width - 2;
  const content = text.length > inner ? text.slice(0, inner) : text;
  const pad = ' '.repeat(Math.max(0, inner - content.length));
  return align === 'left' ? ` ${content}${pad} ` : ` ${pad}${content} `;
}

function formatTable(report: DriftReport): string {
  const cols: Array<{ label: string; width: number; align: 'left' | 'right' }> = [
    { label: 'Category', width: 13, align: 'left' },
    { label: 'Tokens', width: 8, align: 'right' },
    { label: 'In Code', width: 9, align: 'right' },
    { label: 'Drifted', width: 11, align: 'right' },
    { label: 'Unused', width: 8, align: 'right' },
  ];

  const bar = (l: string, m: string, r: string) => l + cols.map((c) => '─'.repeat(c.width)).join(m) + r;
  const lines: string[] = [];
  lines.push(bar('┌', '┬', '┐'));
  lines.push('│' + cols.map((c) => cell(c.label, c.width, 'left')).join('│') + '│');
  lines.push(bar('├', '┼', '┤'));

  for (const key of CATEGORY_ORDER) {
    const category = report.categories[key];
    const dots = driftDotCount(category);
    const plainDrifted = `${category.driftedValues.length}${dots > 0 ? ` ${'●'.repeat(dots)}` : ''}`;
    let driftedCell = cell(plainDrifted, cols[3]!.width, 'right');
    if (dots > 0) {
      const dotColor = dots === 3 ? RED : dots === 2 ? YELLOW : GREEN;
      driftedCell = driftedCell.replace('●'.repeat(dots), `${dotColor}${'●'.repeat(dots)}${RESET}`);
    }

    const row = [
      cell(CATEGORY_LABEL[key], cols[0]!.width, 'left'),
      cell(String(category.tokensInSource), cols[1]!.width, 'right'),
      cell(String(category.uniqueValuesInCode), cols[2]!.width, 'right'),
      driftedCell,
      cell(String(category.unusedTokens.length), cols[4]!.width, 'right'),
    ];
    lines.push('│' + row.join('│') + '│');
  }

  lines.push(bar('└', '┴', '┘'));
  return lines.join('\n');
}

function formatDriftedValue(
  categoryKey: (typeof CATEGORY_ORDER)[number],
  dv: DriftedValue,
): string[] {
  const lines: string[] = [];
  const fileCount = new Set(dv.files.map((f) => f.file)).size;
  lines.push(
    `  ${red(dv.value)}  ${dim(`(not in ${CATEGORY_NOUN[categoryKey]})`)}   ` +
      `${dv.occurrences} occurrence${dv.occurrences !== 1 ? 's' : ''} in ${fileCount} file${fileCount !== 1 ? 's' : ''}`,
  );
  if (dv.nearestToken) {
    const delta = numericDelta(dv.value, dv.nearestToken);
    lines.push(`    ${dim('→')} nearest: ${green(dv.nearestToken)}${delta ? `  ${dim(delta)}` : ''}`);
  }
  return lines;
}

// Best-effort Δ for the two numeric categories (spacing/fontSizes/radii use
// an "Npx" value string on both sides) — colors' nearestToken is a
// "name (#hex)" label, not worth re-deriving a ΔE here just for display.
function numericDelta(value: string, nearestToken: string): string | null {
  const a = parseFloat(value);
  const b = parseFloat(nearestToken);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const diff = Math.abs(a - b);
  return diff === 0 ? null : `Δ${diff}px`;
}

function formatUnusedTokens(report: DriftReport): string[] {
  const lines: string[] = [];
  const colorNames = report.categories.colors.unusedTokens;
  if (colorNames.length > 0) lines.push(`  colors: ${colorNames.join(', ')}`);

  for (const key of ['spacing', 'fontSizes', 'radii'] as const) {
    const tokens = report.categories[key].unusedTokens;
    if (tokens.length > 0) lines.push(`  ${key}: ${tokens.map((t) => `${t}px`).join(', ')}`);
  }

  const fonts = report.categories.fontFamilies.unusedTokens;
  if (fonts.length > 0) lines.push(`  fonts: ${fonts.join(', ')}`);

  return lines;
}

export interface FormatDriftOptions {
  /** show every drifted value instead of just the top N */
  verbose?: boolean;
}

const TOP_N_DEFAULT = 10;

export function formatDriftReport(report: DriftReport, options: FormatDriftOptions = {}): string {
  const lines: string[] = [];

  const sourceLabel = SOURCE_LABEL[report.source.id] ?? report.source.id;
  const relFile = report.source.file ? relativeToCwd(report.source.file) : undefined;
  const sourceLine = relFile ? `${sourceLabel} (${relFile})` : sourceLabel;
  const titleLines = [
    'DESIGN SYSTEM DRIFT REPORT',
    `Source: ${sourceLine}`,
    `Scanned: ${report.summary.filesScanned} file${report.summary.filesScanned !== 1 ? 's' : ''}, ${report.summary.totalValueOccurrences} value${report.summary.totalValueOccurrences !== 1 ? 's' : ''} extracted`,
  ];
  const boxWidth = Math.max(...titleLines.map((t) => t.length)) + 4;
  lines.push(`╭${'─'.repeat(boxWidth)}╮`);
  for (const t of titleLines) lines.push(`│  ${t.padEnd(boxWidth - 3)}│`);
  lines.push(`╰${'─'.repeat(boxWidth)}╯`);
  lines.push('');

  const pct = report.summary.driftPercentage;
  const pctColor = pct >= 30 ? red : pct >= 10 ? yellow : green;
  lines.push(
    bold(
      `DRIFT: ${pctColor(`${pct.toFixed(1)}%`)}  ` +
        `(${report.summary.totalDriftedValues} off-token values / ${report.summary.totalUniqueValuesInCode} unique values)`,
    ),
  );
  lines.push('');
  lines.push(formatTable(report));
  lines.push('');

  const allDrifted = CATEGORY_ORDER.flatMap((key) =>
    report.categories[key].driftedValues.map((dv) => ({ key, dv })),
  ).sort((a, b) => b.dv.occurrences - a.dv.occurrences);

  if (allDrifted.length > 0) {
    lines.push(bold('TOP DRIFTED VALUES (most occurrences first):'));
    const shown = options.verbose ? allDrifted : allDrifted.slice(0, TOP_N_DEFAULT);
    for (const { key, dv } of shown) {
      lines.push(...formatDriftedValue(key, dv));
    }
    if (!options.verbose && allDrifted.length > TOP_N_DEFAULT) {
      lines.push(dim(`  … and ${allDrifted.length - TOP_N_DEFAULT} more (--verbose to show all)`));
    }
    lines.push('');
  }

  const unusedLines = formatUnusedTokens(report);
  if (unusedLines.length > 0) {
    lines.push(bold('UNUSED TOKENS (defined in source, never used in code):'));
    lines.push(...unusedLines);
    lines.push('');
  }

  return lines.join('\n');
}
