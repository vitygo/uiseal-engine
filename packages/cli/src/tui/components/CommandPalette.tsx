import { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { getSuggestionEntries, parseCommandLine, COMMANDS, type SuggestionEntry } from '../command-registry.js';
import { applySuggestion, navigateHistoryDown, navigateHistoryUp } from '../palette-logic.js';

const MAX_VISIBLE_SUGGESTIONS = 6;

export interface ExecutedCommand {
  command: string;
  args: string[];
}

interface CommandPaletteProps {
  history: string[];
  onExecute: (parsed: ExecutedCommand) => void;
  onHistoryRecord: (line: string) => void;
  onCancel: () => void;
}

export default function CommandPalette({
  history,
  onExecute,
  onHistoryRecord,
  onCancel,
}: CommandPaletteProps) {
  const [value, setValue] = useState('');
  const [selectedSuggestion, setSelectedSuggestion] = useState<number | null>(null);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const suggestions = useMemo(
    () => getSuggestionEntries(value).slice(0, MAX_VISIBLE_SUGGESTIONS),
    [value],
  );

  const stopBrowsingHistory = () => {
    setHistoryIndex(null);
  };

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (key.tab) {
      const target = suggestions[selectedSuggestion ?? 0];
      if (target) {
        setValue((v) => applySuggestion(v, target.value));
        setSelectedSuggestion(null);
        setError('');
      }
      return;
    }

    if (key.return) {
      if (selectedSuggestion !== null) {
        const target = suggestions[selectedSuggestion];
        if (target) {
          setValue((v) => applySuggestion(v, target.value));
        }
        setSelectedSuggestion(null);
        return;
      }

      const parsed = parseCommandLine(value);
      if (!parsed) return;

      const known = COMMANDS.some((c) => c.name === parsed.command);
      if (!known) {
        setError(`Unknown command "${parsed.command}"`);
        return;
      }

      onHistoryRecord(value.trim());
      onExecute(parsed);
      return;
    }

    if (key.upArrow) {
      if (suggestions.length > 0) {
        setSelectedSuggestion((i) => (i === null ? suggestions.length - 1 : Math.max(0, i - 1)));
        return;
      }
      const next = navigateHistoryUp(history, { value, historyIndex, draft });
      setValue(next.value);
      setHistoryIndex(next.historyIndex);
      setDraft(next.draft);
      return;
    }

    if (key.downArrow) {
      if (suggestions.length > 0) {
        setSelectedSuggestion((i) => (i === null ? null : Math.min(suggestions.length - 1, i + 1)));
        return;
      }
      const next = navigateHistoryDown(history, { value, historyIndex, draft });
      setValue(next.value);
      setHistoryIndex(next.historyIndex);
      setDraft(next.draft);
      return;
    }

    if (key.backspace || key.delete) {
      setValue((v) => v.slice(0, -1));
      setSelectedSuggestion(null);
      setError('');
      stopBrowsingHistory();
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      setValue((v) => v + input);
      setSelectedSuggestion(null);
      setError('');
      stopBrowsingHistory();
    }
  });

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="#333333" paddingX={1}>
      <Box flexDirection="row">
        <Text color="#666666">{': '}</Text>
        <Text color="#ffffff">{value}</Text>
        <Text color="#444444">▌</Text>
      </Box>

      {error && (
        <Box marginTop={1}>
          <Text color="#666666">{error}</Text>
        </Box>
      )}

      {!error && suggestions.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {suggestions.map((s, i) => (
            <SuggestionRow key={`${s.kind}:${s.value}`} entry={s} isSelected={i === selectedSuggestion} />
          ))}
        </Box>
      )}

      <Box marginTop={1}>
        <Text color="#222222">
          tab · complete  ↵ · run  ↑↓ · {suggestions.length > 0 ? 'suggestions' : 'history'}  esc · cancel
        </Text>
      </Box>
    </Box>
  );
}

function SuggestionRow({ entry, isSelected }: { entry: SuggestionEntry; isSelected: boolean }) {
  const valueColor = entry.kind === 'value' ? '#7a7a7a' : isSelected ? '#ffffff' : '#888888';
  return (
    <Box flexDirection="row" backgroundColor={isSelected ? '#1a1a1a' : undefined} paddingX={isSelected ? 1 : 0}>
      <Text color={valueColor} bold={isSelected}>
        {entry.value.padEnd(16)}
      </Text>
      {entry.description && <Text color="#333333">{entry.description}</Text>}
    </Box>
  );
}
