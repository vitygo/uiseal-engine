import { useState } from 'react';
import { Box, Text, useInput } from 'ink';

const BASELINE_ITEMS = [
  { command: 'status', description: 'Show path, enabled state, and debt counts' },
  { command: 'update', description: 'Rescan and rewrite baseline (freeze current debt)' },
  { command: 'prune', description: 'Remove fingerprints for fixed issues (bank progress)' },
  { command: 'disable', description: 'Set baseline.enabled = false in config' },
];

interface BaselineMenuProps {
  onSelect: (subcmd: string) => void;
  onBack: () => void;
}

export default function BaselineMenu({ onSelect, onBack }: BaselineMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (key.escape || input === 'b') {
      onBack();
    } else if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setSelectedIndex((i) => Math.min(BASELINE_ITEMS.length - 1, i + 1));
    } else if (key.return) {
      const item = BASELINE_ITEMS[selectedIndex];
      if (item) onSelect(item.command);
    }
  });

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Box marginBottom={1} flexDirection="row" gap={1}>
        <Text color="#555555" bold>baseline</Text>
        <Text color="#333333">— Manage design-debt baseline</Text>
      </Box>

      <Box flexDirection="column" marginBottom={2}>
        {BASELINE_ITEMS.map((item, i) => {
          const isSelected = i === selectedIndex;
          return (
            <Box key={item.command} flexDirection="row" justifyContent="space-between">
              <Box flexDirection="row">
                <Text color={isSelected ? '#888888' : '#2a2a2a'}>
                  {isSelected ? ' › ' : '   '}
                </Text>
                <Box
                  backgroundColor={isSelected ? '#1a1a1a' : undefined}
                  paddingX={isSelected ? 1 : 0}
                >
                  <Text color={isSelected ? '#ffffff' : '#555555'} bold={isSelected}>
                    {item.command.padEnd(10)}
                  </Text>
                </Box>
                <Text color="#333333">  {item.description}</Text>
              </Box>
              {isSelected && <Text color="#2a2a2a"> ↵ </Text>}
            </Box>
          );
        })}
      </Box>

      <Box>
        <Text color="#2a2a2a">↑↓ navigate  ↵ run  esc/b back</Text>
      </Box>
    </Box>
  );
}
