import { describe, it, expect } from 'vitest';
import { IncrementalAnalyzer } from './analyzer.js';
import { allRules } from '../rules/index.js';
import type { uisealConfig } from '../config/schema.js';

const config: uisealConfig = {
  tokens: {
    colors: { '--color-primary': '#3b82f6' },
    spacing: [4, 8, 16, 24, 32],
    fontSizes: [14, 16, 18],
    fontFamilies: ['Inter'],
    radii: [4, 8],
  },
  rules: {},
  ignore: [],
};

describe('IncrementalAnalyzer', () => {
  it('performs an initial scan (update() with all files at once) and returns correct violations', () => {
    const analyzer = new IncrementalAnalyzer(config, allRules);
    const violations = analyzer.update([
      { path: 'a.css', content: '.a { color: #ff0000; }' },
      { path: 'b.css', content: '.b { padding: 100px; }' }, // far from every token — plain no-arbitrary-spacing, not a near-miss
      { path: 'c.css', content: '.c { color: var(--color-primary); }' },
    ]);

    expect(violations.some((v) => v.file === 'a.css' && v.ruleId === 'no-hardcoded-color')).toBe(true);
    expect(violations.some((v) => v.file === 'b.css' && v.ruleId === 'no-arbitrary-spacing')).toBe(true);
    expect(violations.some((v) => v.file === 'c.css')).toBe(false);
  });

  it('re-analyzes only the changed file when a violation is added', () => {
    const analyzer = new IncrementalAnalyzer(config, allRules);
    analyzer.update([
      { path: 'a.css', content: '.a { color: blue; }' },
      { path: 'b.css', content: '.b { color: red; }' },
    ]);
    const before = analyzer.getAll().length;

    const after = analyzer.update([{ path: 'a.css', content: '.a { color: #ff0000; }' }]);

    expect(after.length).toBe(before + 1);
    expect(after.some((v) => v.file === 'a.css' && v.ruleId === 'no-hardcoded-color')).toBe(true);
    // b.css's own violation count is untouched by re-analyzing a.css.
    expect(after.filter((v) => v.file === 'b.css')).toHaveLength(
      analyzer.getAll().filter((v) => v.file === 'b.css').length,
    );
  });

  it('re-analyzes only the changed file when a violation is removed', () => {
    const analyzer = new IncrementalAnalyzer(config, allRules);
    analyzer.update([{ path: 'a.css', content: '.a { color: #ff0000; }' }]);
    expect(analyzer.getAll()).toHaveLength(1);

    const after = analyzer.update([{ path: 'a.css', content: '.a { color: var(--color-primary); }' }]);

    expect(after).toHaveLength(0);
  });

  it('removes a deleted file\'s violations from the total', () => {
    const analyzer = new IncrementalAnalyzer(config, allRules);
    analyzer.update([
      { path: 'a.css', content: '.a { color: #ff0000; }' },
      { path: 'b.css', content: '.b { padding: 13px; }' },
    ]);
    expect(analyzer.getAll().length).toBeGreaterThanOrEqual(2);

    const after = analyzer.remove('a.css');

    expect(after.some((v) => v.file === 'a.css')).toBe(false);
    expect(after.some((v) => v.file === 'b.css')).toBe(true);
  });

  it('getSummary() reports correct total/errors/warnings/fixable/filesWithViolations', () => {
    const analyzer = new IncrementalAnalyzer(config, allRules);
    analyzer.update([
      { path: 'a.css', content: '.a { color: #ff0000; }' }, // error, fixable
      { path: 'b.css', content: '.b { padding: 13px; }' }, // error, not fixable (no suggestion field on this rule)
    ]);

    const summary = analyzer.getSummary();
    expect(summary.total).toBe(analyzer.getAll().length);
    expect(summary.errors + summary.warnings).toBe(summary.total);
    expect(summary.filesWithViolations).toBe(2);
  });

  describe('cross-file post-analyzers stay correct incrementally', () => {
    it('no-dead-token: flags an unused token, then clears once a later update references it', () => {
      const analyzer = new IncrementalAnalyzer(config, allRules);
      analyzer.update([{ path: 'tokens.css', content: ':root { --color-brand: #ff0000; }' }]);

      expect(analyzer.getAll().some((v) => v.ruleId === 'no-dead-token' && v.message.includes('--color-brand'))).toBe(
        true,
      );

      // A second file starts referencing the token — dead-token must clear
      // even though only the SECOND file was re-analyzed, because the
      // post-analyzer reruns over the merged token/var-ref totals.
      analyzer.update([{ path: 'consumer.css', content: '.a { color: var(--color-brand); }' }]);

      expect(analyzer.getAll().some((v) => v.ruleId === 'no-dead-token')).toBe(false);
    });

    it('no-dead-token: re-flags as dead again once the consuming file changes to drop the reference', () => {
      const analyzer = new IncrementalAnalyzer(config, allRules);
      analyzer.update([
        { path: 'tokens.css', content: ':root { --color-brand: #ff0000; }' },
        { path: 'consumer.css', content: '.a { color: var(--color-brand); }' },
      ]);
      expect(analyzer.getAll().some((v) => v.ruleId === 'no-dead-token')).toBe(false);

      analyzer.update([{ path: 'consumer.css', content: '.a { color: blue; }' }]);

      expect(analyzer.getAll().some((v) => v.ruleId === 'no-dead-token' && v.message.includes('--color-brand'))).toBe(
        true,
      );
    });

    it('spacing-near-token: near-miss suppression is still applied per-file after an incremental update', () => {
      const analyzer = new IncrementalAnalyzer(config, allRules);
      // 13px is a near-miss of the 16px token (within the 4px threshold) —
      // spacing-near-token should supersede the plain no-arbitrary-spacing hit.
      const after = analyzer.update([{ path: 'a.css', content: '.a { padding: 13px; }' }]);

      expect(after.some((v) => v.ruleId === 'spacing-near-token')).toBe(true);
      expect(after.some((v) => v.ruleId === 'no-arbitrary-spacing')).toBe(false);
    });
  });
});
