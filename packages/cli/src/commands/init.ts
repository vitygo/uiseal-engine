import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import { extract, clusterColors, buildGlob, getSourceById, getAllSources, detectSources } from '@uiseal/core';
import type { ExtractedTokens } from '@uiseal/core';
import type { ColorCluster } from '@uiseal/core';
import type { SourceTokens } from '@uiseal/core';
import { intro, outro, spinner, confirm, text, note, select, isCancel, cancel } from '@clack/prompts';

const MIN_COUNT = 2;

function bail(): never {
  cancel('Cancelled.');
  process.exit(0);
}

async function askConfirm(message: string): Promise<boolean> {
  const result = await confirm({ message });
  if (isCancel(result)) bail();
  return result as boolean;
}

async function askText(message: string, placeholder: string): Promise<string> {
  const result = await text({ message, placeholder });
  if (isCancel(result)) bail();
  return result as string;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.replace('#', '').match(/^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function colorSquare(hex: string, useColor: boolean): string {
  if (!useColor) return '■';
  const rgb = hexToRgb(hex);
  if (!rgb) return '■';
  return `\x1b[48;2;${rgb.r};${rgb.g};${rgb.b}m  \x1b[0m`;
}

function colorNote(clusters: ColorCluster[], colorMap: Map<string, number>): string {
  const useColor = process.stdout.hasColors?.() ?? false;
  if (clusters.length === 0) return '(none found)';
  return clusters
    .map((c) => {
      const sq = colorSquare(c.representative, useColor);
      const similar = c.members
        .filter((m) => m !== c.representative)
        .map((m) => `${colorSquare(m, useColor)} ${m} ×${colorMap.get(m) ?? 0}`)
        .join(', ');
      const line = `${sq} ${c.representative}  ×${c.totalCount}`;
      return similar ? `${line}   [similar: ${similar}]` : line;
    })
    .join('\n');
}

function numericNote(entries: [number, number][]): string {
  if (entries.length === 0) return '(none found with usage ≥2)';
  return entries.map(([v, count]) => `${v}px ×${count}`).join('   ');
}

function familyNote(map: Map<string, number>): string {
  if (map.size === 0) return '(none found)';
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([v, count]) => `"${v}"  ×${count}`)
    .join('   ');
}

function parseManualColors(input: string): Record<string, string> {
  const record: Record<string, string> = {};
  input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((hex, i) => {
      record[`color-${i + 1}`] = hex.startsWith('#') ? hex : `#${hex}`;
    });
  return record;
}

function parseManualNumbers(input: string): number[] {
  return input
    .split(',')
    .map((s) => parseFloat(s.trim()))
    .filter((n) => !isNaN(n));
}

function parseManualStrings(input: string): string[] {
  return input
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function buildConfigJson(
  colorsRecord: Record<string, string>,
  spacingValues: number[],
  fontSizeValues: number[],
  fontFamilyValues: string[],
  radiiValues: number[],
  severity: 'warn' | 'error',
): string {
  const config = {
    tokens: {
      colors: colorsRecord,
      spacing: spacingValues,
      fontSizes: fontSizeValues,
      fontFamilies: fontFamilyValues,
      radii: radiiValues,
    },
    rules: {
      'no-hardcoded-color': severity,
      'no-arbitrary-spacing': severity,
      'no-arbitrary-font-size': severity,
      'no-arbitrary-radius': severity,
      'no-unauthorized-font-family': severity,
      'enforce-contrast': severity,
      'no-img-without-alt': 'warn',
      'no-div-button': 'warn',
      'no-empty-button': 'warn',
      'no-missing-form-label': 'warn',
      'no-positive-tabindex': 'warn',
      'no-autofocus': 'warn',
    },
    wcag: { level: 'AA' },
    ignore: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/*.min.css',
      '**/*.min.js',
    ],
  };
  return JSON.stringify(config, null, 2);
}

// ── Flat review flow (Tailwind / CSS vars sources) ──────────────────────────
// SourceTokens (from a real token source) carries no usage counts or color
// clusters — unlike code-scan's ExtractedTokens, there's nothing to count or
// cluster since these values ARE the user's actual design tokens, not
// candidates inferred from repetition. This mirrors the per-category
// confirm-or-edit shape of the code-scan review below, just against flat
// arrays/records instead of Maps.

function colorNoteFlat(entries: [string, string][]): string {
  const useColor = process.stdout.hasColors?.() ?? false;
  if (entries.length === 0) return '(none found)';
  return entries.map(([name, hex]) => `${colorSquare(hex, useColor)} ${name}: ${hex}`).join('\n');
}

function numericNoteFlat(values: number[]): string {
  if (values.length === 0) return '(none found)';
  return values.map((v) => `${v}px`).join('   ');
}

function familyNoteFlat(values: string[]): string {
  if (values.length === 0) return '(none found)';
  return values.map((v) => `"${v}"`).join('   ');
}

interface ReviewedTokens {
  colorsRecord: Record<string, string>;
  spacingValues: number[];
  fontSizeValues: number[];
  fontFamilyValues: string[];
  radiiValues: number[];
}

async function reviewSourceTokens(tokens: SourceTokens): Promise<ReviewedTokens> {
  const colorEntries = Object.entries(tokens.colors);
  note(colorNoteFlat(colorEntries), `Colors — ${colorEntries.length} found`);
  let colorsRecord: Record<string, string>;
  if (colorEntries.length === 0) {
    colorsRecord = parseManualColors(
      await askText('No colors found. Enter hex values manually (comma-separated):', '#ffffff, #000000'),
    );
  } else {
    const use = await askConfirm('Use these colors as your design tokens?');
    colorsRecord = use
      ? tokens.colors
      : parseManualColors(await askText('Enter hex colors manually (comma-separated):', '#ffffff, #000000'));
  }

  note(numericNoteFlat(tokens.spacing), `Spacing — ${tokens.spacing.length} value${tokens.spacing.length !== 1 ? 's' : ''} found`);
  let spacingValues: number[];
  if (tokens.spacing.length === 0) {
    spacingValues = parseManualNumbers(
      await askText('No spacing values found. Enter values in px (comma-separated):', '4, 8, 16, 24, 32'),
    );
  } else {
    const use = await askConfirm('Use these spacing values?');
    spacingValues = use
      ? tokens.spacing
      : parseManualNumbers(await askText('Enter spacing values in px (comma-separated):', '4, 8, 16, 24, 32'));
  }

  note(numericNoteFlat(tokens.fontSizes), `Font sizes — ${tokens.fontSizes.length} value${tokens.fontSizes.length !== 1 ? 's' : ''} found`);
  let fontSizeValues: number[];
  if (tokens.fontSizes.length === 0) {
    fontSizeValues = parseManualNumbers(
      await askText('No font sizes found. Enter values in px (comma-separated):', '12, 14, 16, 18, 24, 32'),
    );
  } else {
    const use = await askConfirm('Use these font sizes?');
    fontSizeValues = use
      ? tokens.fontSizes
      : parseManualNumbers(
          await askText('Enter font sizes in px (comma-separated):', '12, 14, 16, 18, 24, 32'),
        );
  }

  note(familyNoteFlat(tokens.fontFamilies), `Font families — ${tokens.fontFamilies.length} found`);
  let fontFamilyValues: string[];
  if (tokens.fontFamilies.length === 0) {
    fontFamilyValues = [];
  } else {
    const use = await askConfirm('Use these font families?');
    fontFamilyValues = use
      ? tokens.fontFamilies
      : parseManualStrings(await askText('Enter font family names (comma-separated):', 'Inter, JetBrains Mono'));
  }

  note(numericNoteFlat(tokens.radii), `Radii — ${tokens.radii.length} value${tokens.radii.length !== 1 ? 's' : ''} found`);
  let radiiValues: number[];
  if (tokens.radii.length === 0) {
    radiiValues = parseManualNumbers(await askText('No radii found. Enter values in px (comma-separated):', '4, 8'));
  } else {
    const use = await askConfirm('Use these border radii?');
    radiiValues = use
      ? tokens.radii
      : parseManualNumbers(await askText('Enter border radius values in px (comma-separated):', '4, 8'));
  }

  return { colorsRecord, spacingValues, fontSizeValues, fontFamilyValues, radiiValues };
}

// ── Source resolution ────────────────────────────────────────────────────────

// 'code' is a friendly --from alias for the 'code-scan' source id — every
// other valid id comes straight from the registry, so a newly-registered
// source is immediately valid here with no change to this file.
async function resolveSourceChoice(fromOpt: string | undefined, cwd: string): Promise<string> {
  if (fromOpt) {
    if (fromOpt === 'code') return 'code-scan';
    if (!getSourceById(fromOpt)) {
      const available = ['code', ...getAllSources().map((s) => s.id).filter((id) => id !== 'code-scan')];
      process.stderr.write(
        `Unknown token source "${fromOpt}". Available: ${available.join(', ')}.\n`,
      );
      process.exit(1);
    }
    return fromOpt;
  }

  // Auto-detect: code-scan is always "found" (confidence 0.1, the fallback
  // of last resort) — only ask the user when a REAL source is also present.
  const detected = await detectSources(cwd);
  const realSources = detected.filter((d) => d.source.id !== 'code-scan');

  if (realSources.length === 0) {
    return 'code-scan';
  }

  if (realSources.length === 1 && realSources[0]!.result.confidence > 0.5) {
    const { source, result } = realSources[0]!;
    note(
      `Found tokens in ${result.file ? path.relative(cwd, result.file) : source.label} — using ${source.label} as token source.`,
      'Auto-detected',
    );
    return source.id;
  }

  const options = detected.map(({ source, result }) => ({
    value: source.id,
    label:
      source.id === 'code-scan'
        ? `${source.label} (fallback)`
        : `${source.label}${result.file ? ` (${path.relative(cwd, result.file)})` : ''}`,
  }));
  const answer = await select({
    message: 'Found design tokens in multiple places. Which should uiseal use as the source of truth?',
    options,
  });
  if (isCancel(answer)) bail();
  return answer as string;
}

async function askSeverity(): Promise<'warn' | 'error'> {
  const severityAnswer = await select({
    message: 'How strict should violations be treated?',
    options: [
      {
        value: 'warn',
        label: 'warn',
        hint: 'flag issues but never block (recommended for projects with existing drift)',
      },
      {
        value: 'error',
        label: 'error',
        hint: 'block commits and PRs on any violation (recommended for new projects)',
      },
    ],
  });
  if (isCancel(severityAnswer)) bail();
  return severityAnswer as 'warn' | 'error';
}

// ── Tailwind / CSS-vars init flow ───────────────────────────────────────────

async function runSourceInit(sourceId: string, cwd: string, configPath: string): Promise<void> {
  const source = getSourceById(sourceId)!;

  const s = spinner();
  s.start(`Reading ${source.label}…`);

  const detected = await source.detect(cwd);
  if (!detected.found) {
    s.stop('Not found.');
    process.stderr.write(`No ${source.label} found in this project.\n`);
    process.exit(1);
  }

  let tokens: SourceTokens;
  try {
    tokens = await source.extract(cwd);
  } catch (err) {
    s.stop('Extraction failed.');
    process.stderr.write(`Error: ${(err as Error).message}\n`);
    process.exit(2);
  }
  s.stop(`Read ${detected.file ? path.relative(cwd, detected.file) : source.label}.`);

  const { colorsRecord, spacingValues, fontSizeValues, fontFamilyValues, radiiValues } =
    await reviewSourceTokens(tokens);

  const severity = await askSeverity();

  const configSource = buildConfigJson(
    colorsRecord,
    spacingValues,
    fontSizeValues,
    fontFamilyValues,
    radiiValues,
    severity,
  );

  fs.writeFileSync(configPath, configSource, 'utf8');

  outro(
    `Wrote ${configPath}\n` +
      `Source: ${source.label}${detected.file ? ` (${path.relative(cwd, detected.file)})` : ''}\n` +
      `Run 'uiseal check' to scan your project.`,
  );
}

export const initCommand = new Command('init')
  .description('Interactively extract design tokens from source and write a uiseal.config.json draft')
  .option('-f, --force', 'Overwrite an existing config file')
  .option(
    '--from <source>',
    `Token source to use: ${getAllSources()
      .map((s) => (s.id === 'code-scan' ? 'code' : s.id))
      .join(' | ')} (default: auto-detect)`,
  )
  .action(async (opts: { force?: boolean; from?: string }) => {
    const configPath = path.resolve('uiseal.config.json');

    if (fs.existsSync(configPath) && !opts.force) {
      process.stderr.write(
        `Config already exists at ${configPath}. Use --force to overwrite.\n`,
      );
      process.exit(1);
    }

    intro('uiseal init');

    const cwd = process.cwd();
    const sourceId = await resolveSourceChoice(opts.from, cwd);

    if (sourceId !== 'code-scan') {
      await runSourceInit(sourceId, cwd, configPath);
      return;
    }

    // ── Scan ────────────────────────────────────────────────────────────────
    let extracted!: ExtractedTokens;
    let clusters!: ColorCluster[];
    let fileCount!: number;

    const s = spinner();
    s.start(`Scanning ${buildGlob()}…`);
    try {
      const filePaths = await glob(buildGlob(), {
        cwd: process.cwd(),
        ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**'],
      });
      fileCount = filePaths.length;
      const files = new Map<string, string>();
      for (const fp of filePaths) {
        files.set(fp, fs.readFileSync(fp, 'utf8'));
      }
      extracted = extract(files);
      clusters = clusterColors(extracted.colors);
      s.stop(`Scanned ${fileCount} file${fileCount !== 1 ? 's' : ''}.`);
    } catch (err) {
      s.stop('Scan failed.');
      process.stderr.write(`Error: ${(err as Error).message}\n`);
      process.exit(2);
    }

    // ── Colors ──────────────────────────────────────────────────────────────
    note(
      colorNote(clusters, extracted.colors),
      `Colors — ${clusters.length} cluster${clusters.length !== 1 ? 's' : ''} from ${extracted.colors.size} unique value${extracted.colors.size !== 1 ? 's' : ''}`,
    );

    let colorsRecord: Record<string, string>;

    if (clusters.length === 0) {
      const input = await askText(
        'No colors found. Enter hex values manually (comma-separated):',
        '#ffffff, #000000',
      );
      colorsRecord = parseManualColors(input);
    } else {
      const useColors = await askConfirm('Use these color clusters as your design tokens?');
      if (useColors) {
        colorsRecord = {};
        clusters.forEach((c, i) => {
          let key = extracted.cssVars.get(c.representative);
          if (!key) {
            for (const m of c.members) {
              key = extracted.cssVars.get(m);
              if (key) break;
            }
          }
          colorsRecord[key ?? `--color-${i + 1}`] = c.representative;
        });
      } else {
        const input = await askText(
          'Enter hex colors manually (comma-separated):',
          '#ffffff, #000000',
        );
        colorsRecord = parseManualColors(input);
      }
    }

    // ── Spacing ─────────────────────────────────────────────────────────────
    const spacingEntries = [...extracted.spacing.entries()]
      .filter(([, c]) => c >= MIN_COUNT)
      .sort((a, b) => a[0] - b[0]);

    note(
      numericNote(spacingEntries),
      `Spacing — ${spacingEntries.length} value${spacingEntries.length !== 1 ? 's' : ''} used ≥${MIN_COUNT}×`,
    );

    let spacingValues: number[];
    if (spacingEntries.length === 0) {
      const input = await askText(
        'No spacing values found. Enter values in px (comma-separated):',
        '4, 8, 16, 24, 32',
      );
      spacingValues = parseManualNumbers(input);
    } else {
      const useSpacing = await askConfirm('Use these spacing values?');
      spacingValues = useSpacing
        ? spacingEntries.map(([v]) => v)
        : parseManualNumbers(
            await askText('Enter spacing values in px (comma-separated):', '4, 8, 16, 24, 32'),
          );
    }

    // ── Font sizes ───────────────────────────────────────────────────────────
    const fontSizeEntries = [...extracted.fontSizes.entries()]
      .filter(([, c]) => c >= MIN_COUNT)
      .sort((a, b) => a[0] - b[0]);

    note(
      numericNote(fontSizeEntries),
      `Font sizes — ${fontSizeEntries.length} value${fontSizeEntries.length !== 1 ? 's' : ''} used ≥${MIN_COUNT}×`,
    );

    let fontSizeValues: number[];
    if (fontSizeEntries.length === 0) {
      const input = await askText(
        'No font sizes found. Enter values in px (comma-separated):',
        '12, 14, 16, 18, 24, 32',
      );
      fontSizeValues = parseManualNumbers(input);
    } else {
      const useFontSizes = await askConfirm('Use these font sizes?');
      fontSizeValues = useFontSizes
        ? fontSizeEntries.map(([v]) => v)
        : parseManualNumbers(
            await askText(
              'Enter font sizes in px (comma-separated):',
              '12, 14, 16, 18, 24, 32',
            ),
          );
    }

    // ── Font families ────────────────────────────────────────────────────────
    note(
      familyNote(extracted.fontFamilies),
      `Font families — ${extracted.fontFamilies.size} found`,
    );

    let fontFamilyValues: string[];
    if (extracted.fontFamilies.size === 0) {
      note(
        'No font families were detected. The config will be written with an empty\n' +
          '"fontFamilies" array — add your font names there manually (e.g. "Inter", "Roboto").',
        'Font families — none detected',
      );
      fontFamilyValues = [];
    } else {
      const useFamilies = await askConfirm('Use these font families?');
      fontFamilyValues = useFamilies
        ? [...extracted.fontFamilies.keys()]
        : parseManualStrings(
            await askText('Enter font family names (comma-separated):', 'Inter, JetBrains Mono'),
          );
    }

    // ── Radii ────────────────────────────────────────────────────────────────
    const radiiEntries = [...extracted.radii.entries()]
      .filter(([, c]) => c >= MIN_COUNT)
      .sort((a, b) => a[0] - b[0]);

    note(
      numericNote(radiiEntries),
      `Radii — ${radiiEntries.length} value${radiiEntries.length !== 1 ? 's' : ''} used ≥${MIN_COUNT}×`,
    );

    let radiiValues: number[];
    if (radiiEntries.length === 0) {
      const input = await askText(
        'No radii found. Enter values in px (comma-separated):',
        '4, 8',
      );
      radiiValues = parseManualNumbers(input);
    } else {
      const useRadii = await askConfirm('Use these border radii?');
      radiiValues = useRadii
        ? radiiEntries.map(([v]) => v)
        : parseManualNumbers(
            await askText('Enter border radius values in px (comma-separated):', '4, 8'),
          );
    }

    // ── Severity ─────────────────────────────────────────────────────────────
    const severityAnswer = await select({
      message: 'How strict should violations be treated?',
      options: [
        {
          value: 'warn',
          label: 'warn',
          hint: 'flag issues but never block (recommended for projects with existing drift)',
        },
        {
          value: 'error',
          label: 'error',
          hint: 'block commits and PRs on any violation (recommended for new projects)',
        },
      ],
    });
    if (isCancel(severityAnswer)) bail();
    const severity = severityAnswer as 'warn' | 'error';

    // ── Write ────────────────────────────────────────────────────────────────
    const configSource = buildConfigJson(
      colorsRecord,
      spacingValues,
      fontSizeValues,
      fontFamilyValues,
      radiiValues,
      severity,
    );

    fs.writeFileSync(configPath, configSource, 'utf8');

    outro(`Wrote ${configPath}  →  run uiseal check`);
  });
