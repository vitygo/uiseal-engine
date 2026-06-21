export interface ViolationSnapshot {
  ruleId: string;
  file: string;
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning';
  category: 'design' | 'a11y' | 'security' | 'quality';
  fix?: { suggested: string };
}

export interface DiffResult {
  baseCount: number;
  headCount: number;
  newCount: number;
  fixedCount: number;
  netChange: number;

  blocking: ViolationSnapshot[];
  warnings: ViolationSnapshot[];
  fixed: ViolationSnapshot[];

  fileImpact: Array<{
    file: string;
    before: number;
    after: number;
    delta: number;
  }>;

  autoFixableCount: number;

  verdict: 'pass' | 'needs-attention' | 'blocking';

  deadTokensRemoved: number;
  securityIssuesFound: number;
}

function violationKey(v: ViolationSnapshot): string {
  return `${v.ruleId}\0${v.file}\0${v.message}`;
}

export function diffScans(
  base: ViolationSnapshot[],
  head: ViolationSnapshot[],
): DiffResult {
  const baseKeys = new Map<string, ViolationSnapshot>();
  for (const v of base) {
    const key = violationKey(v);
    if (!baseKeys.has(key)) baseKeys.set(key, v);
  }

  const headKeys = new Map<string, ViolationSnapshot>();
  for (const v of head) {
    const key = violationKey(v);
    if (!headKeys.has(key)) headKeys.set(key, v);
  }

  const newViolations: ViolationSnapshot[] = [];
  for (const [key, v] of headKeys) {
    if (!baseKeys.has(key)) newViolations.push(v);
  }

  const fixedViolations: ViolationSnapshot[] = [];
  for (const [key, v] of baseKeys) {
    if (!headKeys.has(key)) fixedViolations.push(v);
  }

  const blocking = newViolations.filter((v) => v.severity === 'error');
  const warnings = newViolations.filter((v) => v.severity === 'warning');

  // Per-file impact
  const fileCounts = new Map<string, { before: number; after: number }>();
  const allFiles = new Set([...base.map((v) => v.file), ...head.map((v) => v.file)]);
  for (const file of allFiles) {
    fileCounts.set(file, { before: 0, after: 0 });
  }
  for (const v of base) fileCounts.get(v.file)!.before++;
  for (const v of head) fileCounts.get(v.file)!.after++;

  const fileImpact = Array.from(fileCounts.entries())
    .map(([file, { before, after }]) => ({ file, before, after, delta: after - before }))
    .filter((f) => f.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const autoFixableCount = newViolations.filter((v) => v.fix?.suggested !== undefined).length;

  let verdict: DiffResult['verdict'];
  if (blocking.length > 0) {
    verdict = 'blocking';
  } else if (warnings.length > 5) {
    verdict = 'needs-attention';
  } else {
    verdict = 'pass';
  }

  const deadTokensRemoved = fixedViolations.filter((v) => v.ruleId === 'no-dead-token').length;
  const securityIssuesFound = newViolations.filter((v) => v.category === 'security').length;

  return {
    baseCount: base.length,
    headCount: head.length,
    newCount: newViolations.length,
    fixedCount: fixedViolations.length,
    netChange: head.length - base.length,
    blocking,
    warnings,
    fixed: fixedViolations,
    fileImpact,
    autoFixableCount,
    verdict,
    deadTokensRemoved,
    securityIssuesFound,
  };
}

function verdictLabel(verdict: DiffResult['verdict']): string {
  switch (verdict) {
    case 'blocking':
      return '🚫 Blocking';
    case 'needs-attention':
      return '⚠️ Needs attention';
    case 'pass':
      return '✅ Looks good';
  }
}

function netChangeArrow(netChange: number): string {
  if (netChange < 0) return '↓ better';
  if (netChange > 0) return '↑ worse';
  return 'no change';
}

function formatViolationLine(v: ViolationSnapshot): string {
  return `- \`${v.file}:${v.line}\` — ${v.message} \`[${v.ruleId}]\``;
}

export function formatDiffAsMarkdown(diff: DiffResult): string {
  const lines: string[] = [];

  lines.push('## 🦭 UISeal PR Review');
  lines.push('');
  lines.push(`### Verdict: ${verdictLabel(diff.verdict)}`);

  // Blocking issues
  if (diff.blocking.length > 0) {
    lines.push('');
    lines.push(`### Blocking issues (${diff.blocking.length} must fix before merge)`);
    const shown = diff.blocking.slice(0, 10);
    for (const v of shown) lines.push(formatViolationLine(v));
    if (diff.blocking.length > 10) {
      lines.push(`+ ${diff.blocking.length - 10} more`);
    }
  }

  // Warnings
  if (diff.warnings.length > 0) {
    lines.push('');
    lines.push(`### Warnings (${diff.warnings.length})`);
    const shown = diff.warnings.slice(0, 5);
    for (const v of shown) lines.push(formatViolationLine(v));
    if (diff.warnings.length > 5) {
      lines.push(`+ ${diff.warnings.length - 5} more`);
    }
  }

  // Design system impact
  lines.push('');
  lines.push('### Design system impact');
  lines.push(
    `- **+${diff.newCount}** violations added / **-${diff.fixedCount}** removed`,
  );
  lines.push(`- Net change: **${diff.netChange}** (${netChangeArrow(diff.netChange)})`);
  if (diff.deadTokensRemoved > 0) {
    lines.push(`- 🧹 ${diff.deadTokensRemoved} dead tokens cleaned up`);
  }

  // Files most affected
  const topFiles = diff.fileImpact.slice(0, 5);
  if (topFiles.length > 0) {
    lines.push('');
    lines.push('### Files most affected');
    lines.push('| File | Before | After | Change |');
    lines.push('|------|--------|-------|--------|');
    for (const f of topFiles) {
      const change = f.delta > 0 ? `+${f.delta}` : `${f.delta}`;
      lines.push(`| ${f.file} | ${f.before} | ${f.after} | ${change} |`);
    }
  }

  // Auto-fixable
  if (diff.autoFixableCount > 0) {
    lines.push('');
    lines.push('### Auto-fixable');
    lines.push(`${diff.autoFixableCount} violations can be fixed automatically.`);
    lines.push('Run: `uiseal check --fix`');
  }

  // Security
  if (diff.securityIssuesFound > 0) {
    lines.push('');
    lines.push('### Security');
    lines.push(
      `⚠️ ${diff.securityIssuesFound} new security issues found. Review carefully before merging.`,
    );
  }

  lines.push('');
  lines.push('---');
  lines.push('*UISeal — deterministic design system governance*');
  lines.push('*No AI, no external data. [docs](https://uiseal.io/docs)*');

  return lines.join('\n');
}
