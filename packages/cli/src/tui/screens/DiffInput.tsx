import { useState } from 'react';
import { Box, Text, useInput } from 'ink';

interface DiffInputProps {
  onSubmit: (branch: string) => void;
  onBack: () => void;
}

export default function DiffInput({ onSubmit, onBack }: DiffInputProps) {
  const [branch, setBranch] = useState('main');

  useInput((input, key) => {
    if (key.escape) {
      onBack();
    } else if (key.return) {
      onSubmit(branch.trim() || 'main');
    } else if (key.backspace || key.delete) {
      setBranch((b) => b.slice(0, -1));
    } else if (input && !key.ctrl && !key.meta) {
      setBranch((b) => b + input);
    }
  });

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Box marginBottom={1} flexDirection="row" gap={1}>
        <Text color="#555555" bold>diff</Text>
        <Text color="#333333">— Compare HEAD against a base branch</Text>
      </Box>

      <Box marginBottom={2} flexDirection="row">
        <Text color="#333333">Enter base branch: </Text>
        <Text color="#ffffff">{branch}</Text>
        <Text color="#333333">▌</Text>
      </Box>

      <Box>
        <Text color="#2a2a2a">↵ run  esc back</Text>
      </Box>
    </Box>
  );
}
