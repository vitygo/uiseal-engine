// A CI-friendly JSON shape on top of the raw DriftReport: DriftedValue is
// nested per-category in the core type (report.categories.colors.driftedValues,
// etc.), which is the natural shape for the terminal formatter but awkward
// for scripting — a CI step that wants "every drifted value, worst first,
// with its category" shouldn't have to know or reconstruct the category
// structure itself. This flattens it once, tagging each entry, without
// changing the core DriftReport/DriftedValue types (those stay focused on
// what the formatter needs).
import type { DriftReport, DriftedValue } from './analyze-drift.js';

const CATEGORY_KEYS = ['colors', 'spacing', 'fontSizes', 'radii', 'fontFamilies'] as const;
export type DriftCategoryKey = (typeof CATEGORY_KEYS)[number];

export interface DriftJsonValue extends DriftedValue {
  category: DriftCategoryKey;
}

export interface DriftJson extends DriftReport {
  /** every category's driftedValues flattened into one list, each tagged with its category, sorted by occurrence count descending */
  driftedValues: DriftJsonValue[];
}

export function toDriftJson(report: DriftReport): DriftJson {
  const driftedValues: DriftJsonValue[] = CATEGORY_KEYS.flatMap((category) =>
    report.categories[category].driftedValues.map((dv) => ({ category, ...dv })),
  ).sort((a, b) => b.occurrences - a.occurrences);

  return { ...report, driftedValues };
}

export function formatDriftJson(report: DriftReport): string {
  return JSON.stringify(toDriftJson(report), null, 2);
}
