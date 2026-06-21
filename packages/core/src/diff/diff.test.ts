import { describe, it, expect } from 'vitest';
import { diffScans, formatDiffAsMarkdown } from './index.js';
import type { ViolationSnapshot } from './index.js';

function makeViolation(overrides: Partial<ViolationSnapshot> = {}): ViolationSnapshot {
  return {
    ruleId: 'no-hardcoded-color',
    file: 'src/Component.tsx',
    line: 10,
    column: 1,
    message: 'Use a design token instead of a hardcoded color',
    severity: 'error',
    category: 'design',
    ...overrides,
  };
}

describe('diffScans', () => {
  it('new error violation → verdict blocking, appears in blocking[]', () => {
    const base: ViolationSnapshot[] = [];
    const head = [makeViolation({ severity: 'error' })];
    const result = diffScans(base, head);
    expect(result.verdict).toBe('blocking');
    expect(result.blocking).toHaveLength(1);
    expect(result.blocking[0].ruleId).toBe('no-hardcoded-color');
    expect(result.newCount).toBe(1);
  });

  it('new warning violation → verdict pass when <=5', () => {
    const base: ViolationSnapshot[] = [];
    const head = [makeViolation({ severity: 'warning' })];
    const result = diffScans(base, head);
    expect(result.verdict).toBe('pass');
    expect(result.warnings).toHaveLength(1);
  });

  it('new warning violation → verdict needs-attention when >5', () => {
    const base: ViolationSnapshot[] = [];
    const head = Array.from({ length: 6 }, (_, i) =>
      makeViolation({ severity: 'warning', message: `warning ${i}` }),
    );
    const result = diffScans(base, head);
    expect(result.verdict).toBe('needs-attention');
    expect(result.warnings).toHaveLength(6);
  });

  it('violation removed → appears in fixed[], fixedCount incremented', () => {
    const v = makeViolation({ severity: 'warning' });
    const result = diffScans([v], []);
    expect(result.fixed).toHaveLength(1);
    expect(result.fixedCount).toBe(1);
    expect(result.newCount).toBe(0);
  });

  it('same violation (ruleId+file+message match) → not in new or fixed', () => {
    const v = makeViolation();
    const result = diffScans([v], [v]);
    expect(result.newCount).toBe(0);
    expect(result.fixedCount).toBe(0);
    expect(result.blocking).toHaveLength(0);
    expect(result.fixed).toHaveLength(0);
  });

  it('line number shift → NOT counted as new (matching ignores line numbers)', () => {
    const base = [makeViolation({ line: 10 })];
    const head = [makeViolation({ line: 42 })];
    const result = diffScans(base, head);
    expect(result.newCount).toBe(0);
    expect(result.fixedCount).toBe(0);
  });

  it('counts baseCount and headCount correctly', () => {
    const base = [makeViolation({ message: 'a' }), makeViolation({ message: 'b' })];
    const head = [makeViolation({ message: 'b' }), makeViolation({ message: 'c' })];
    const result = diffScans(base, head);
    expect(result.baseCount).toBe(2);
    expect(result.headCount).toBe(2);
    expect(result.newCount).toBe(1);
    expect(result.fixedCount).toBe(1);
    expect(result.netChange).toBe(0);
  });

  it('netChange is headCount - baseCount', () => {
    const base = [makeViolation({ message: 'a' }), makeViolation({ message: 'b' })];
    const head = [makeViolation({ message: 'c' })];
    const result = diffScans(base, head);
    expect(result.netChange).toBe(-1);
  });

  it('deadTokensRemoved counts fixed no-dead-token violations', () => {
    const dead = makeViolation({ ruleId: 'no-dead-token', severity: 'warning' });
    const result = diffScans([dead], []);
    expect(result.deadTokensRemoved).toBe(1);
  });

  it('deadTokensRemoved is 0 when no no-dead-token violations fixed', () => {
    const v = makeViolation({ ruleId: 'no-hardcoded-color' });
    const result = diffScans([v], []);
    expect(result.deadTokensRemoved).toBe(0);
  });

  it('securityIssuesFound counts new security category violations', () => {
    const sec = makeViolation({ category: 'security', message: 'sec issue' });
    const result = diffScans([], [sec]);
    expect(result.securityIssuesFound).toBe(1);
  });

  it('autoFixableCount counts new violations with fix.suggested', () => {
    const fixable = makeViolation({ fix: { suggested: 'var(--color-primary)' }, message: 'fixable' });
    const notFixable = makeViolation({ message: 'not fixable' });
    const result = diffScans([], [fixable, notFixable]);
    expect(result.autoFixableCount).toBe(1);
  });

  it('fileImpact is populated correctly and sorted by |delta|', () => {
    const base = [
      makeViolation({ file: 'a.tsx', message: 'x' }),
      makeViolation({ file: 'a.tsx', message: 'y' }),
      makeViolation({ file: 'b.tsx', message: 'z' }),
    ];
    const head = [
      makeViolation({ file: 'b.tsx', message: 'z' }),
      makeViolation({ file: 'b.tsx', message: 'new1' }),
      makeViolation({ file: 'b.tsx', message: 'new2' }),
    ];
    const result = diffScans(base, head);
    const aImpact = result.fileImpact.find((f) => f.file === 'a.tsx')!;
    const bImpact = result.fileImpact.find((f) => f.file === 'b.tsx')!;
    expect(aImpact.before).toBe(2);
    expect(aImpact.after).toBe(0);
    expect(aImpact.delta).toBe(-2);
    expect(bImpact.before).toBe(1);
    expect(bImpact.after).toBe(3);
    expect(bImpact.delta).toBe(2);
  });

  it('fileImpact excludes files with delta === 0', () => {
    const v = makeViolation();
    const result = diffScans([v], [v]);
    expect(result.fileImpact).toHaveLength(0);
  });
});

describe('formatDiffAsMarkdown', () => {
  it('blocking section appears only when blocking.length > 0', () => {
    const noBlocking = diffScans([], [makeViolation({ severity: 'warning' })]);
    const withBlocking = diffScans([], [makeViolation({ severity: 'error' })]);

    expect(formatDiffAsMarkdown(noBlocking)).not.toContain('### Blocking issues');
    expect(formatDiffAsMarkdown(withBlocking)).toContain('### Blocking issues');
  });

  it('verdict emoji matches verdict field — blocking', () => {
    const diff = diffScans([], [makeViolation({ severity: 'error' })]);
    const md = formatDiffAsMarkdown(diff);
    expect(diff.verdict).toBe('blocking');
    expect(md).toContain('🚫 Blocking');
  });

  it('verdict emoji matches verdict field — needs-attention', () => {
    const head = Array.from({ length: 6 }, (_, i) =>
      makeViolation({ severity: 'warning', message: `w${i}` }),
    );
    const diff = diffScans([], head);
    const md = formatDiffAsMarkdown(diff);
    expect(diff.verdict).toBe('needs-attention');
    expect(md).toContain('⚠️ Needs attention');
  });

  it('verdict emoji matches verdict field — pass', () => {
    const diff = diffScans([], []);
    const md = formatDiffAsMarkdown(diff);
    expect(diff.verdict).toBe('pass');
    expect(md).toContain('✅ Looks good');
  });

  it('netChange negative → shows ↓ better', () => {
    const base = [makeViolation({ message: 'a' }), makeViolation({ message: 'b' })];
    const diff = diffScans(base, []);
    const md = formatDiffAsMarkdown(diff);
    expect(diff.netChange).toBeLessThan(0);
    expect(md).toContain('↓ better');
  });

  it('netChange positive → shows ↑ worse', () => {
    const head = [makeViolation({ message: 'a' }), makeViolation({ message: 'b' })];
    const diff = diffScans([], head);
    const md = formatDiffAsMarkdown(diff);
    expect(diff.netChange).toBeGreaterThan(0);
    expect(md).toContain('↑ worse');
  });

  it('deadTokensRemoved > 0 → cleanup line appears in markdown', () => {
    const dead = makeViolation({ ruleId: 'no-dead-token', severity: 'warning' });
    const diff = diffScans([dead], []);
    const md = formatDiffAsMarkdown(diff);
    expect(diff.deadTokensRemoved).toBe(1);
    expect(md).toContain('🧹');
    expect(md).toContain('dead tokens cleaned up');
  });

  it('deadTokensRemoved === 0 → cleanup line absent', () => {
    const diff = diffScans([], []);
    const md = formatDiffAsMarkdown(diff);
    expect(md).not.toContain('dead tokens cleaned up');
  });

  it('blocking list truncates at 10 with "+ N more"', () => {
    const head = Array.from({ length: 12 }, (_, i) =>
      makeViolation({ severity: 'error', message: `error ${i}` }),
    );
    const diff = diffScans([], head);
    const md = formatDiffAsMarkdown(diff);
    expect(md).toContain('+ 2 more');
  });

  it('warnings list truncates at 5 with "+ N more"', () => {
    const head = Array.from({ length: 8 }, (_, i) =>
      makeViolation({ severity: 'warning', message: `warn ${i}` }),
    );
    const diff = diffScans([], head);
    const md = formatDiffAsMarkdown(diff);
    expect(md).toContain('+ 3 more');
  });

  it('security section appears only when securityIssuesFound > 0', () => {
    const noSec = diffScans([], [makeViolation({ category: 'design' })]);
    const withSec = diffScans([], [makeViolation({ category: 'security', message: 'sec' })]);
    expect(formatDiffAsMarkdown(noSec)).not.toContain('### Security');
    expect(formatDiffAsMarkdown(withSec)).toContain('### Security');
  });

  it('auto-fixable section appears only when autoFixableCount > 0', () => {
    const noFix = diffScans([], [makeViolation()]);
    const withFix = diffScans([], [makeViolation({ fix: { suggested: 'x' }, message: 'fixable' })]);
    expect(formatDiffAsMarkdown(noFix)).not.toContain('### Auto-fixable');
    expect(formatDiffAsMarkdown(withFix)).toContain('### Auto-fixable');
  });

  it('files most affected table only shows top 5', () => {
    const base = Array.from({ length: 6 }, (_, i) =>
      makeViolation({ file: `file${i}.tsx`, message: 'old' }),
    );
    const diff = diffScans(base, []);
    const md = formatDiffAsMarkdown(diff);
    // 6 files with delta != 0, but only top 5 shown in table
    const tableRows = (md.match(/\| file\d+\.tsx /g) ?? []).length;
    expect(tableRows).toBe(5);
  });

  it('files most affected section absent when no fileImpact', () => {
    const diff = diffScans([], []);
    expect(formatDiffAsMarkdown(diff)).not.toContain('### Files most affected');
  });

  it('output always ends with uiseal footer', () => {
    const diff = diffScans([], []);
    const md = formatDiffAsMarkdown(diff);
    expect(md).toContain('*UISeal — deterministic design system governance*');
    expect(md).toContain('*No AI, no external data. [docs](https://uiseal.io/docs)*');
  });
});
