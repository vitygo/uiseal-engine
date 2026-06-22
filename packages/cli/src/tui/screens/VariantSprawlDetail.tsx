import * as fs from 'node:fs';
import * as path from 'node:path';
import { Box, Text, useInput, useWindowSize } from 'ink';
import type { Violation } from '@uiseal/core';
import { openInEditor } from '../utils/openInEditor.js';

function relPath(file: string): string {
  const rel = path.relative(process.cwd(), file);
  return rel.startsWith('..') ? file : rel;
}

function readSnippet(
  filePath: string,
  line: number,
  context: number = 5,
): { lines: string[]; startLine: number } {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const allLines = content.split('\n');
    const startLine = Math.max(1, line - context);
    const endLine = Math.min(allLines.length, line + context);
    return { lines: allLines.slice(startLine - 1, endLine), startLine };
  } catch {
    return { lines: ['(file not readable)'], startLine: line };
  }
}

interface PanelProps {
  label: string;
  filePath: string;
  line: number;
  width: number;
}

function Panel({ label, filePath, line, width }: PanelProps) {
  const { lines, startLine } = readSnippet(filePath, line);
  const display = relPath(filePath);
  const truncated = display.length > width - 2 ? '…' + display.slice(-(width - 3)) : display;

  return (
    <Box flexDirection="column" width={width}>
      <Text color="#888888" bold>
        {label}
      </Text>
      <Text color="#444444" dimColor>
        {truncated}
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {lines.map((codeLine, i) => {
          const lineNum = startLine + i;
          const isTarget = lineNum === line;
          return (
            <Box key={lineNum} flexDirection="row">
              <Text color={isTarget ? '#888888' : '#2a2a2a'}>
                {String(lineNum).padStart(4)}{' '}
              </Text>
              <Text color={isTarget ? '#cccccc' : '#444444'} bold={isTarget}>
                {codeLine.slice(0, width - 6)}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

interface VariantSprawlDetailProps {
  violation: Violation;
  onBack: () => void;
}

export default function VariantSprawlDetail({ violation, onBack }: VariantSprawlDetailProps) {
  const { columns } = useWindowSize();
  const { compare } = violation;

  useInput((input, key) => {
    if (key.escape || input === 'b') {
      onBack();
    } else if (input === 'o' && compare) {
      openInEditor(compare.a.file, compare.a.line);
    } else if (input === 'O' && compare) {
      openInEditor(compare.b.file, compare.b.line);
    }
  });

  if (!compare) return null;

  const usableWidth = Math.min(columns - 4, 160);
  const panelWidth = Math.floor((usableWidth - 2) / 2);

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Box marginBottom={1} flexDirection="row" gap={1}>
        <Text color="#555555">Variant Sprawl</Text>
        <Text color="#2a2a2a">—</Text>
        <Text color="#888888">{compare.a.name}</Text>
        <Text color="#333333">↔</Text>
        <Text color="#888888">{compare.b.name}</Text>
      </Box>

      <Box marginBottom={1}>
        <Text color="#1e1e1e">{'─'.repeat(Math.min(columns - 4, 60))}</Text>
      </Box>

      <Box flexDirection="row" gap={2} marginBottom={1}>
        <Panel label={compare.a.name} filePath={compare.a.file} line={compare.a.line} width={panelWidth} />
        <Panel label={compare.b.name} filePath={compare.b.file} line={compare.b.line} width={panelWidth} />
      </Box>

      <Box marginBottom={1}>
        <Text color="#1e1e1e">{'─'.repeat(Math.min(columns - 4, 60))}</Text>
      </Box>

      <Box flexDirection="row" gap={2}>
        <Box borderStyle="single" borderColor="#222222" paddingX={1}>
          <Text color="#555555">o · open left</Text>
        </Box>
        <Box borderStyle="single" borderColor="#222222" paddingX={1}>
          <Text color="#444444">O · open right</Text>
        </Box>
        <Box borderStyle="single" borderColor="#1e1e1e" paddingX={1}>
          <Text color="#333333">esc · back</Text>
        </Box>
      </Box>
    </Box>
  );
}
