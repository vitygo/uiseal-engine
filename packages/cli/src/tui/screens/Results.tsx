import { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import path from 'node:path';
import type { CheckResult } from '../../check-runner.js';
import type { Violation } from '@uiseal/core';

interface ResultsProps {
  result: CheckResult;
  onBack: () => void;
  onQuit: () => void;
}

function relPath(file: string): string {
  const rel = path.relative(process.cwd(), file);
  return rel.startsWith('..') ? file : rel;
}

const A11Y_RULE_IDS = new Set([
  'no-img-without-alt',
  'no-div-button',
  'no-empty-button',
  'no-missing-form-label',
  'no-positive-tabindex',
  'no-autofocus',
]);

const DESIGN_RULE_IDS = new Set([
  'spacing-near-token',
  'no-arbitrary-spacing',
  'no-dead-token',
]);

function categoryFromRuleId(ruleId: string): string {
  if (ruleId === 'variant-sprawl') return 'variant-sprawl';
  if (A11Y_RULE_IDS.has(ruleId) || ruleId.startsWith('a11y/')) return 'A11y';
  if (DESIGN_RULE_IDS.has(ruleId) || ruleId.startsWith('design/')) return 'Design';
  if (ruleId.startsWith('security/')) return 'Security';
  return 'Quality';
}

interface FileGroup {
  file: string;
  violations: Violation[];
}

function groupByFile(violations: Violation[]): FileGroup[] {
  const map = new Map<string, Violation[]>();
  for (const v of violations) {
    const existing = map.get(v.file) ?? [];
    existing.push(v);
    map.set(v.file, existing);
  }
  return [...map.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([file, vs]) => ({ file, violations: vs }));
}

type FlatRow =
  | { type: 'file-header'; file: string }
  | { type: 'violation'; violation: Violation };

function flattenRows(grouped: FileGroup[]): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const { file, violations } of grouped) {
    rows.push({ type: 'file-header', file });
    for (const v of violations) {
      rows.push({ type: 'violation', violation: v });
    }
  }
  return rows;
}

const TAB_ORDER = ['All', 'Design', 'A11y', 'Security', 'Quality', 'variant-sprawl'];
const WINDOW_SIZE = 12;

export default function Results({ result, onBack, onQuit }: ResultsProps) {
  const { violations, baseline } = result;

  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  const allTabs = useMemo(() => {
    const present = new Set<string>();
    for (const v of violations) present.add(categoryFromRuleId(v.ruleId));
    return ['All', ...TAB_ORDER.slice(1).filter((t) => present.has(t))];
  }, [violations]);

  const activeTab = allTabs[activeTabIndex] ?? 'All';

  const tabViolations = useMemo(() => {
    if (activeTab === 'All') return violations;
    return violations.filter((v) => categoryFromRuleId(v.ruleId) === activeTab);
  }, [violations, activeTab]);

  const highPriority = useMemo(() => {
    if (activeTab !== 'All') return [];
    return violations
      .filter(
        (v) =>
          categoryFromRuleId(v.ruleId) === 'variant-sprawl' &&
          v.message.includes('Duplicate:'),
      )
      .slice(0, 4);
  }, [violations, activeTab]);

  const rows = useMemo(() => flattenRows(groupByFile(tabViolations)), [tabViolations]);
  const totalRows = rows.length;

  const maxScroll = Math.max(0, totalRows - WINDOW_SIZE);
  const visibleRows = rows.slice(scrollOffset, scrollOffset + WINDOW_SIZE);

  const errors = useMemo(() => violations.filter((v) => v.severity === 'error'), [violations]);
  const warnings = useMemo(
    () => violations.filter((v) => v.severity === 'warning'),
    [violations],
  );
  const totalScanned =
    baseline.counts.baselined + baseline.counts.new + baseline.counts.resolved;

  useInput((input, key) => {
    if ((input === '' && key.escape) || input === 'b') {
      onBack();
    } else if (input === 'q' || (key.ctrl && input === 'c')) {
      onQuit();
    } else if (key.leftArrow) {
      setActiveTabIndex((i) => Math.max(0, i - 1));
      setScrollOffset(0);
    } else if (key.rightArrow) {
      setActiveTabIndex((i) => Math.min(allTabs.length - 1, i + 1));
      setScrollOffset(0);
    } else if (key.upArrow) {
      setScrollOffset((o) => Math.max(0, o - 1));
    } else if (key.downArrow) {
      setScrollOffset((o) => Math.min(maxScroll, o + 1));
    }
  });

  const showStart = totalRows === 0 ? 0 : scrollOffset + 1;
  const showEnd = Math.min(scrollOffset + WINDOW_SIZE, totalRows);

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      {/* Summary header */}
      <Box flexDirection="row" gap={2} marginBottom={1}>
        <Text color="#666666">✓</Text>
        <Text color="#888888">
          Scanned {totalScanned} file{totalScanned !== 1 ? 's' : ''}
        </Text>
        {errors.length > 0 && (
          <Text color="#555555">
            · {errors.length} error{errors.length !== 1 ? 's' : ''}
          </Text>
        )}
        {warnings.length > 0 && (
          <Text color="#444444">
            · {warnings.length} warning{warnings.length !== 1 ? 's' : ''}
          </Text>
        )}
        {violations.length === 0 && <Text color="#444444">· no violations</Text>}
      </Box>

      {/* Baseline info */}
      {baseline.status === 'active' && (
        <Box marginBottom={1}>
          <Text color="#333333">
            design debt: {baseline.counts.baselineTotal} → {baseline.counts.baselined}
            {'  '}
            {baseline.counts.new > 0 && `· ${baseline.counts.new} new`}
            {baseline.counts.resolved > 0 && ` · ${baseline.counts.resolved} fixed`}
          </Text>
        </Box>
      )}

      {/* Tab bar */}
      {allTabs.length > 1 && (
        <Box flexDirection="row" marginBottom={1}>
          {allTabs.map((tab, i) => {
            const isActive = i === activeTabIndex;
            const count =
              tab === 'All'
                ? violations.length
                : violations.filter((v) => categoryFromRuleId(v.ruleId) === tab).length;
            return (
              <Box key={tab} marginRight={1}>
                <Text
                  bold={isActive}
                  underline={isActive}
                  color={isActive ? '#aaaaaa' : '#333333'}
                >
                  [{tab}({count})]
                </Text>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Divider */}
      <Box marginBottom={1}>
        <Text color="#1e1e1e">{'─'.repeat(60)}</Text>
      </Box>

      {/* High priority (All tab: variant-sprawl Duplicate: findings) */}
      {highPriority.length > 0 && (
        <Box flexDirection="column" marginBottom={2}>
          <Text color="#333333">HIGH PRIORITY</Text>
          <Box marginTop={1} flexDirection="column">
            {highPriority.map((v, i) => {
              const firstLine = v.message.split('\n')[0] ?? '';
              const truncated =
                firstLine.length > 50 ? firstLine.slice(0, 47) + '…' : firstLine;
              return (
                <Box key={i} flexDirection="row" gap={2}>
                  <Text color="#2a2a2a">  ·</Text>
                  <Text color="#444444" dimColor>
                    {relPath(v.file)}:{v.line}
                  </Text>
                  <Text color="#333333">{truncated}</Text>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      {/* Violations grouped by file */}
      {tabViolations.length === 0 ? (
        <Box marginBottom={2}>
          <Text color="#444444">  No violations found.</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginBottom={1}>
          {visibleRows.map((row, i) => {
            if (row.type === 'file-header') {
              return (
                <Box key={`h-${i}`} marginTop={i > 0 ? 1 : 0}>
                  <Text color="#2a2a2a" dimColor>
                    {relPath(row.file)}
                  </Text>
                </Box>
              );
            }
            const v = row.violation;
            const firstLine = v.message.split('\n')[0] ?? '';
            const msg = firstLine.length > 42 ? firstLine.slice(0, 39) + '…' : firstLine;
            return (
              <Box key={`v-${i}`} flexDirection="row">
                <Text color="#1e1e1e">{'  '}</Text>
                <Text color="#2a2a2a">{String(v.line).padStart(4)}:{String(v.column).padEnd(3)}</Text>
                <Text color="#1e1e1e">{'  '}</Text>
                <Text color="#333333">{v.ruleId.padEnd(20)}</Text>
                <Text color="#444444" dimColor>
                  {msg}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Scroll indicator */}
      {totalRows > WINDOW_SIZE && (
        <Box marginBottom={1}>
          <Text color="#2a2a2a" dimColor>
            showing {showStart}–{showEnd} of {totalRows}
          </Text>
        </Box>
      )}

      {/* Divider */}
      <Box marginBottom={1}>
        <Text color="#1e1e1e">{'─'.repeat(60)}</Text>
      </Box>

      {/* Baseline note */}
      {baseline.status === 'active' && baseline.counts.baselined > 0 && (
        <Box marginBottom={1}>
          <Text color="#2a2a2a" dimColor>
            Note: {baseline.counts.baselined} violation{baseline.counts.baselined !== 1 ? 's' : ''} are frozen in baseline. Run 'uiseal baseline prune' to bank fixed issues.
          </Text>
        </Box>
      )}

      {/* Action row */}
      <Box flexDirection="row" gap={2}>
        <Box borderStyle="single" borderColor="#222222" paddingX={1}>
          <Text color="#555555">b · back</Text>
        </Box>
        <Box borderStyle="single" borderColor="#1e1e1e" paddingX={1}>
          <Text color="#333333">q · quit</Text>
        </Box>
        {allTabs.length > 1 && (
          <Box borderStyle="single" borderColor="#1a1a1a" paddingX={1}>
            <Text color="#2a2a2a">← → switch category</Text>
          </Box>
        )}
        {totalRows > WINDOW_SIZE && (
          <Box borderStyle="single" borderColor="#1a1a1a" paddingX={1}>
            <Text color="#2a2a2a">↑ ↓ scroll</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
