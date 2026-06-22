import { useState } from 'react';
import { Box, Text, useInput } from 'ink';

interface CommandOutputProps {
  title: string;
  output: string;
  isLoading: boolean;
  onBack: () => void;
}

const WINDOW_SIZE = 20;

export default function CommandOutput({ title, output, isLoading, onBack }: CommandOutputProps) {
  const [scrollOffset, setScrollOffset] = useState(0);

  const lines = output ? output.split('\n') : [];
  const maxScroll = Math.max(0, lines.length - WINDOW_SIZE);
  const visibleLines = lines.slice(scrollOffset, scrollOffset + WINDOW_SIZE);

  useInput((input, key) => {
    if (key.escape || input === 'b' || input === 'h') {
      onBack();
    } else if (key.upArrow) {
      setScrollOffset((o) => Math.max(0, o - 1));
    } else if (key.downArrow) {
      setScrollOffset((o) => Math.min(maxScroll, o + 1));
    }
  });

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Box marginBottom={1}>
        <Text color="#555555">{title}</Text>
      </Box>

      {isLoading ? (
        <Box marginBottom={1}>
          <Text color="#333333">Running…</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginBottom={1}>
          {visibleLines.map((line, i) => (
            <Text key={i} color="#555555">
              {line || ' '}
            </Text>
          ))}
        </Box>
      )}

      {!isLoading && lines.length > WINDOW_SIZE && (
        <Box marginBottom={1}>
          <Text color="#2a2a2a" dimColor>
            {scrollOffset + 1}–{Math.min(scrollOffset + WINDOW_SIZE, lines.length)} of {lines.length}
          </Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text color="#222222">esc/b/h · back{!isLoading && lines.length > WINDOW_SIZE ? '  ↑↓ · scroll' : ''}</Text>
      </Box>
    </Box>
  );
}
