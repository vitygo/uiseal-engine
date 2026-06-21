import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Violation } from '../types.js';
import { fingerprintViolations } from './fingerprint.js';
import { applyBaseline, resolveBaselineResult, pruneBaseline } from './index.js';
import { readBaseline, writeBaseline } from './io.js';
import { setBaselineEnabled } from '../config/writer.js';

const PROJECT_ROOT = '/project';

function makeViolation(overrides: Partial<Violation> = {}): Violation {
  return {
    ruleId: 'no-hardcoded-color',
    severity: 'error',
    message: 'Hardcoded color "#ff0000" in "color".',
    file: '/project/src/styles.css',
    line: 5,
    column: 2,
    ...overrides,
  };
}

describe('fingerprintViolations', () => {
  it('(a) same violation keeps the same fingerprint after an unrelated line is inserted above', () => {
    // Same code position-independent: same rule + file + message → same fingerprint
    // regardless of line number.
    const atLine5 = makeViolation({ line: 5 });
    const atLine10 = makeViolation({ line: 10 }); // same content, just moved down

    const [fp5] = fingerprintViolations([atLine5], PROJECT_ROOT);
    const [fp10] = fingerprintViolations([atLine10], PROJECT_ROOT);

    expect(fp5.fingerprint).toBe(fp10.fingerprint);
  });

  it('different ruleIds produce different fingerprints', () => {
    const v1 = makeViolation({ ruleId: 'no-hardcoded-color' });
    const v2 = makeViolation({ ruleId: 'no-arbitrary-spacing', message: 'Spacing "24px".' });

    const [fp1] = fingerprintViolations([v1], PROJECT_ROOT);
    const [fp2] = fingerprintViolations([v2], PROJECT_ROOT);

    expect(fp1.fingerprint).not.toBe(fp2.fingerprint);
  });

  it('identical violations in the same file get distinct occurrence-index fingerprints', () => {
    const v1 = makeViolation({ line: 1 });
    const v2 = makeViolation({ line: 2 }); // same message, same file

    const [fp1, fp2] = fingerprintViolations([v1, v2], PROJECT_ROOT);
    expect(fp1.fingerprint).not.toBe(fp2.fingerprint);
  });

  it('is fully deterministic — same inputs always produce the same fingerprint', () => {
    const v = makeViolation();
    const run1 = fingerprintViolations([v], PROJECT_ROOT);
    const run2 = fingerprintViolations([v], PROJECT_ROOT);
    expect(run1[0].fingerprint).toBe(run2[0].fingerprint);
  });
});

describe('applyBaseline — filter mode', () => {
  it('(b) hides a baselined violation but surfaces a brand-new one', () => {
    const existing = makeViolation({ line: 5 });
    const brandNew = makeViolation({
      ruleId: 'no-arbitrary-spacing',
      message: 'Spacing "24px" is not in the allowed list.',
      line: 20,
    });

    const fv = fingerprintViolations([existing, brandNew], PROJECT_ROOT);
    // Baseline contains only the first violation.
    const baselineSet = new Set([fv.find((v) => v.ruleId === 'no-hardcoded-color')!.fingerprint]);

    const { violations, counts } = applyBaseline(fv, baselineSet, 'filter');

    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe('no-arbitrary-spacing');
    expect(counts.total).toBe(2);
    expect(counts.baselined).toBe(1);
    expect(counts.new).toBe(1);
  });
});

describe('applyBaseline — all mode', () => {
  it('(c) reports both baselined and new violations with accurate counts', () => {
    const existing = makeViolation({ line: 5 });
    const brandNew = makeViolation({
      ruleId: 'no-arbitrary-spacing',
      message: 'Spacing "24px" is not in the allowed list.',
      line: 20,
    });

    const fv = fingerprintViolations([existing, brandNew], PROJECT_ROOT);
    const baselineSet = new Set([fv[0].fingerprint]);

    const { violations, counts } = applyBaseline(fv, baselineSet, 'all');

    // "all" mode returns every violation, tagged with frozen=true/false.
    expect(violations).toHaveLength(2);
    expect(counts.total).toBe(2);
    expect(counts.baselined).toBe(1); // existing is in baseline
    expect(counts.new).toBe(1);       // brandNew is not in baseline

    // The frozen violation must be correctly tagged.
    const frozenViolation = violations.find((v) => v.ruleId === 'no-hardcoded-color');
    const newViolation    = violations.find((v) => v.ruleId === 'no-arbitrary-spacing');
    expect(frozenViolation?.frozen).toBe(true);
    expect(newViolation?.frozen).toBe(false);
  });
});

describe('cross-cwd fingerprint stability', () => {
  it('(e) baseline written from projectRoot matches when check is run from a different cwd', () => {
    // Fingerprints use paths relative to projectRoot, not cwd, so they are
    // stable regardless of where on disk the user invokes the tool.
    const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'uiseal-cwd-test-'));
    const baselinePath = path.join(tmpProject, '.uiseal-baseline.json');

    try {
      const violations: Violation[] = [
        makeViolation({ file: path.join(tmpProject, 'src', 'styles.css') }),
      ];

      // Write baseline anchored to tmpProject.
      const fv = fingerprintViolations(violations, tmpProject);
      writeBaseline(baselinePath, fv, tmpProject);

      // Simulate running check from a different cwd but same projectRoot.
      // fingerprintViolations receives the same projectRoot so relative paths match.
      const fv2 = fingerprintViolations(violations, tmpProject);
      const baselineSet = readBaseline(baselinePath);
      const { violations: filtered, counts } = applyBaseline(fv2, baselineSet, 'filter');

      expect(filtered).toHaveLength(0);
      expect(counts.baselined).toBe(1);
      expect(counts.new).toBe(0);
    } finally {
      fs.rmSync(tmpProject, { recursive: true });
    }
  });
});

describe('resolveBaselineResult', () => {
  it('(f) baseline.path resolves relative to projectRoot, not cwd', () => {
    const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'uiseal-path-test-'));

    try {
      const violations: Violation[] = [
        makeViolation({ file: path.join(tmpProject, 'app.tsx') }),
      ];
      const config = { baseline: { enabled: true, path: '.uiseal-baseline.json' } };

      const expectedPath = path.resolve(tmpProject, config.baseline.path);
      const cwdPath = path.resolve(process.cwd(), config.baseline.path);

      // Verify our test setup makes cwd and projectRoot differ (otherwise the
      // test would not prove anything).  On most machines tmpProject ≠ cwd.
      // We assert the resolved path uses projectRoot regardless.
      expect(expectedPath).not.toBe(cwdPath);

      // Pre-write the baseline at the project-root-anchored path.
      const fv = fingerprintViolations(violations, tmpProject);
      writeBaseline(expectedPath, fv, tmpProject);

      const { baseline } = resolveBaselineResult(violations, config, tmpProject);

      expect(baseline.resolvedPath).toBe(expectedPath);
      expect(baseline.status).toBe('active');
      expect(baseline.counts.baselined).toBe(1);
      expect(baseline.counts.new).toBe(0);
    } finally {
      fs.rmSync(tmpProject, { recursive: true });
    }
  });

  it('(g) returns status disabled when baseline.enabled is false', () => {
    const violations: Violation[] = [makeViolation()];
    const config = { baseline: { enabled: false, path: '.uiseal-baseline.json' } };

    const { violations: out, baseline } = resolveBaselineResult(violations, config, PROJECT_ROOT);

    expect(baseline.status).toBe('disabled');
    expect(out).toHaveLength(1);
    expect(baseline.counts.total).toBe(1);
    expect(baseline.counts.new).toBe(1);
  });

  it('(h) returns status file-missing when baseline file does not exist', () => {
    const violations: Violation[] = [makeViolation()];
    const config = { baseline: { enabled: true, path: 'nonexistent-baseline.json' } };

    const { violations: out, baseline } = resolveBaselineResult(violations, config, PROJECT_ROOT);

    expect(baseline.status).toBe('file-missing');
    expect(out).toHaveLength(1);
    expect(baseline.counts.new).toBe(1);
  });
});

describe('debt tracking — resolved set', () => {
  it('(10) resolvedCount == 1 after fixing one issue from the baseline', () => {
    const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'uiseal-resolved-'));
    const baselinePath = path.join(tmpProject, '.uiseal-baseline.json');

    try {
      const v1 = makeViolation({ file: path.join(tmpProject, 'a.css'), message: 'Color A' });
      const v2 = makeViolation({ file: path.join(tmpProject, 'a.css'), ruleId: 'no-arbitrary-spacing', message: 'Spacing B' });

      // Snapshot: both violations present.
      const fvSnapshot = fingerprintViolations([v1, v2], tmpProject);
      writeBaseline(baselinePath, fvSnapshot, tmpProject);

      // After fix: v2 removed.
      const { baseline } = resolveBaselineResult([v1], { baseline: { enabled: true, path: baselinePath } }, tmpProject);

      expect(baseline.status).toBe('active');
      expect(baseline.counts.baselined).toBe(1);
      expect(baseline.counts.resolved).toBe(1);
      expect(baseline.counts.new).toBe(0);
      expect(baseline.counts.baselineTotal).toBe(2);
    } finally {
      fs.rmSync(tmpProject, { recursive: true });
    }
  });
});

describe('pruneBaseline', () => {
  it('(11) removes only resolved fingerprints and leaves frozen ones intact', () => {
    const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'uiseal-prune-'));
    const baselinePath = path.join(tmpProject, '.uiseal-baseline.json');

    try {
      const v1 = makeViolation({ file: path.join(tmpProject, 'a.css'), message: 'Color A' });
      const v2 = makeViolation({ file: path.join(tmpProject, 'a.css'), ruleId: 'no-arbitrary-spacing', message: 'Spacing B' });

      const fv = fingerprintViolations([v1, v2], tmpProject);
      writeBaseline(baselinePath, fv, tmpProject);

      // Only v1 still exists — v2 was fixed.
      const { pruned, remaining } = pruneBaseline(baselinePath, [v1], tmpProject);

      expect(pruned).toBe(1);
      expect(remaining).toBe(1);

      // The remaining entry must be v1's fingerprint.
      const kept = readBaseline(baselinePath);
      expect(kept.has(fv[0].fingerprint === fv.find(f => f.message === 'Color A')!.fingerprint
        ? fv.find(f => f.message === 'Color A')!.fingerprint
        : fv[0].fingerprint)).toBe(true);
      expect(kept.size).toBe(1);
    } finally {
      fs.rmSync(tmpProject, { recursive: true });
    }
  });
});

describe('setBaselineEnabled', () => {
  it('(12) writes enabled=true into uiseal.config.json', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uiseal-config-'));
    const configPath = path.join(tmpDir, 'uiseal.config.json');

    try {
      // Write a minimal config without the baseline block.
      fs.writeFileSync(configPath, JSON.stringify({
        tokens: { colors: {}, spacing: [], fontSizes: [], fontFamilies: [], radii: [] },
        rules: {},
      }, null, 2), 'utf8');

      setBaselineEnabled(tmpDir, true);

      const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { baseline?: { enabled?: boolean } };
      expect(raw.baseline?.enabled).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('(12b) writes enabled=false and preserves other config keys', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uiseal-config2-'));
    const configPath = path.join(tmpDir, 'uiseal.config.json');

    try {
      fs.writeFileSync(configPath, JSON.stringify({
        tokens: { colors: { primary: '#000' }, spacing: [8], fontSizes: [], fontFamilies: [], radii: [] },
        rules: { 'no-hardcoded-color': 'error' },
        baseline: { enabled: true, path: '.uiseal-baseline.json' },
      }, null, 2), 'utf8');

      setBaselineEnabled(tmpDir, false);

      const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
        baseline?: { enabled?: boolean; path?: string };
        tokens?: { colors?: Record<string, string> };
      };
      expect(raw.baseline?.enabled).toBe(false);
      expect(raw.baseline?.path).toBe('.uiseal-baseline.json');
      expect(raw.tokens?.colors?.primary).toBe('#000');
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});

describe('writeBaseline / readBaseline', () => {
  it('(d) writes a deterministic, stable-sorted file and reads fingerprints back', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uiseal-baseline-test-'));
    const baselinePath = path.join(tmpDir, '.uiseal-baseline.json');

    try {
      const violations: Violation[] = [
        makeViolation({ line: 10, message: 'Color B' }),
        makeViolation({ line: 1, ruleId: 'no-arbitrary-spacing', message: 'Spacing A' }),
      ];

      const fv = fingerprintViolations(violations, PROJECT_ROOT);
      writeBaseline(baselinePath, fv, PROJECT_ROOT);

      const raw = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
      expect(raw.version).toBe(1);
      expect(Array.isArray(raw.entries)).toBe(true);
      expect(raw.entries).toHaveLength(2);

      // Entries must be sorted by fingerprint.
      const sorted = [...raw.entries].sort(
        (a: { fingerprint: string }, b: { fingerprint: string }) =>
          a.fingerprint.localeCompare(b.fingerprint),
      );
      expect(raw.entries).toEqual(sorted);

      // Writing again is idempotent.
      writeBaseline(baselinePath, fv, PROJECT_ROOT);
      const raw2 = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
      expect(raw2).toEqual(raw);

      // readBaseline returns the full fingerprint set.
      const set = readBaseline(baselinePath);
      for (const v of fv) {
        expect(set.has(v.fingerprint)).toBe(true);
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});
