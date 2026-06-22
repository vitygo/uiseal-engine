import { Box, Text } from 'ink';

interface BannerProps {
  text: string;
}

export default function Banner({ text }: BannerProps) {
  return (
    <Box borderStyle="single" borderColor="#222222" paddingX={1} marginBottom={1}>
      <Box flexGrow={1} flexDirection="row" gap={1}>
        <Text color="#333333">│</Text>
        <Text color="#444444" bold>INFO</Text>
        <Text color="#555555">{text}</Text>
      </Box>
      <Text color="#2a2a2a">× d=dismiss</Text>
    </Box>
  );
}
