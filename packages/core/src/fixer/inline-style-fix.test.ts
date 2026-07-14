import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyFixes } from './apply-fixes.js';
import { analyze } from '../runner.js';
import { noHardcodedColor } from '../rules/no-hardcoded-color.js';
import { noArbitraryFontSize } from '../rules/no-arbitrary-font-size.js';
import { noArbitraryRadius } from '../rules/no-arbitrary-radius.js';
import { noArbitrarySpacing } from '../rules/no-arbitrary-spacing.js';
import type { uisealConfig } from '../config/schema.js';

// PREP finding: the JSX inline-style adapter (runner.ts extractInlineStyleDecls)
// reports a REAL source position for style={{ ... }} entries — it's derived
// from the JSX Property node's own `loc`, not a synthetic placeholder. But,
// exactly like postcss's decl.source.start for real CSS, that position marks
// the start of the property (the object key, e.g. `padding`), not the
// value's offset. applyFixes already handles this for CSS by scanning the
// line for oldValue rather than trusting column as an exact offset, so the
// same mechanism should let --fix work on inline styles too — this file
// confirms that empirically rather than assuming it from the position type.

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uiseal-inline-fix-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const config: uisealConfig = {
  tokens: {
    colors: { '--primary': '#1a73e8' },
    spacing: [4, 8, 16, 20, 32],
    fontSizes: [14, 16, 18],
    fontFamilies: ['Inter'],
    radii: [4, 8],
  },
  rules: {},
  ignore: [],
};

describe('--fix on inline JSX style={{}} props', () => {
  it('fixes a hardcoded color inside style={{}}', async () => {
    const file = path.join(tmpDir, 'Button.tsx');
    fs.writeFileSync(
      file,
      [
        'export function Button() {',
        "  return <button style={{ color: '#1b74e9' }}>Click</button>;",
        '}',
        '',
      ].join('\n'),
    );

    const { violations } = await analyze({
      files: new Map([[file, fs.readFileSync(file, 'utf8')]]),
      config,
      rules: [noHardcodedColor],
    });

    const colorViolation = violations.find((v) => v.ruleId === 'no-hardcoded-color');
    expect(colorViolation?.fix?.suggested).toBe('var(--primary)');
    expect(colorViolation?.oldValue).toBe('#1b74e9');

    const results = applyFixes(violations, { dryRun: false });
    expect(results[0]!.applied).toHaveLength(1);
    expect(results[0]!.skipped).toHaveLength(0);

    const fixed = fs.readFileSync(file, 'utf8');
    expect(fixed).toContain("style={{ color: 'var(--primary)' }}");
  });

  it('fixes an off-scale font-size inside style={{}}, preserving quotes', async () => {
    const file = path.join(tmpDir, 'Heading.tsx');
    fs.writeFileSync(
      file,
      [
        'export function Heading() {',
        "  return <h1 style={{ fontSize: '15px' }}>Title</h1>;",
        '}',
        '',
      ].join('\n'),
    );

    const { violations } = await analyze({
      files: new Map([[file, fs.readFileSync(file, 'utf8')]]),
      config,
      rules: [noArbitraryFontSize],
    });

    const fsViolation = violations.find((v) => v.ruleId === 'no-arbitrary-font-size');
    expect(fsViolation?.fix?.suggested).toBe('14px');
    expect(fsViolation?.oldValue).toBe('15px');

    applyFixes(violations, { dryRun: false });

    const fixed = fs.readFileSync(file, 'utf8');
    expect(fixed).toContain("style={{ fontSize: '14px' }}");
  });

  it('fixes an off-scale radius inside style={{}} and a hardcoded color on the same line', async () => {
    const file = path.join(tmpDir, 'Card.tsx');
    fs.writeFileSync(
      file,
      [
        'export function Card() {',
        "  return <div style={{ borderRadius: '6px', color: '#1b74e9' }} />;",
        '}',
        '',
      ].join('\n'),
    );

    const { violations } = await analyze({
      files: new Map([[file, fs.readFileSync(file, 'utf8')]]),
      config,
      rules: [noArbitraryRadius, noHardcodedColor],
    });

    expect(violations.filter((v) => v.fix?.suggested)).toHaveLength(2);

    const results = applyFixes(violations, { dryRun: false });
    expect(results[0]!.applied).toHaveLength(2);
    expect(results[0]!.skipped).toHaveLength(0);

    const fixed = fs.readFileSync(file, 'utf8');
    expect(fixed).toContain("borderRadius: '4px'");
    expect(fixed).toContain("color: 'var(--primary)'");
  });

  it('known limitation: spacing-near-token never fires on inline styles, so no-arbitrary-spacing on style={{}} has no fix', async () => {
    // spacing-near-token is a post-analyzer fed only by collectNonAllowedSpacingUsages,
    // which walks real CSS ASTs (analyzeCss) — it is never fed from JSX inline
    // styles, so an off-scale inline `padding` never gets a fix.suggested at
    // all (unlike the same value in a real .css file).
    const file = path.join(tmpDir, 'Box.tsx');
    fs.writeFileSync(
      file,
      [
        'export function Box() {',
        "  return <div style={{ padding: '18px' }} />;",
        '}',
        '',
      ].join('\n'),
    );

    const { violations } = await analyze({
      files: new Map([[file, fs.readFileSync(file, 'utf8')]]),
      config,
      rules: [noArbitrarySpacing],
    });

    const spacingViolation = violations.find(
      (v) => v.ruleId === 'no-arbitrary-spacing' || v.ruleId === 'spacing-near-token',
    );
    expect(spacingViolation).toBeDefined();
    expect(spacingViolation!.ruleId).toBe('no-arbitrary-spacing');
    expect(spacingViolation!.fix).toBeUndefined();

    const results = applyFixes(violations, { dryRun: false });
    expect(results[0]!.applied).toHaveLength(0);
    expect(results[0]!.skipped[0]!.reason).toBe('no-fix');

    // File is untouched.
    const after = fs.readFileSync(file, 'utf8');
    expect(after).toContain("padding: '18px'");
  });
});
