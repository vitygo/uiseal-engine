import { useState, useMemo } from 'react';
import { Box, Text, useInput, useWindowSize } from 'ink';
import path from 'node:path';
import os from 'node:os';
import Stars from '../components/Stars.js';
import Banner from '../components/Banner.js';

const VERSION = '0.1.2';

function cwdDisplay(): string {
  const rel = path.relative(os.homedir(), process.cwd());
  const segments = rel.split(path.sep).filter(Boolean);
  if (segments.length <= 2) return '~/' + segments.join('/');
  const last2 = segments.slice(-2).join('/');
  return '~/' + (last2.length > 40 ? last2.slice(-38) + '…' : last2);
}

const LOGO = [
                               
                               
                               
                      
                    
'  ██████  '   ,       
' ████ ███    '     ,  
' ████   █   '     ,   
'  ██    ███    '     ,
'  ██     ██████   '  ,
 ' █████ █   █████   ',
'████████████████████',
                      
                               
];

interface MenuItem {
  command: string;
  description: string;
}

const MENU_ITEMS: MenuItem[] = [
  { command: 'check', description: 'Scan for design-system violations' },
  { command: 'init', description: 'Initialize uiseal.config.json' },
  { command: 'baseline', description: 'Manage design debt baseline' },
  { command: 'diff', description: 'Compare against base branch' },
  { command: 'install-hooks', description: 'Install git pre-commit hooks' },
];

interface HomeProps {
  onRun: (command: string) => void;
  onQuit: () => void;
}

export default function Home({ onRun, onQuit }: HomeProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const { columns } = useWindowSize();

  const filteredItems = useMemo(() => {
    if (!searchQuery) return MENU_ITEMS;
    const q = searchQuery.toLowerCase();
    return MENU_ITEMS.filter(
      (item) =>
        item.command.includes(q) || item.description.toLowerCase().includes(q),
    );
  }, [searchQuery]);

  useInput((input, key) => {
    if (searchMode) {
      if (key.escape) {
        setSearchMode(false);
        setSearchQuery('');
      } else if (key.return) {
        setSearchMode(false);
        const item =
          filteredItems[Math.min(selectedIndex, filteredItems.length - 1)];
        if (item) onRun(item.command);
      } else if (key.backspace || key.delete) {
        setSearchQuery((q) => q.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta && !key.shift) {
        setSearchQuery((q) => q + input);
        setSelectedIndex(0);
      }
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setSelectedIndex((i) =>
        Math.min(filteredItems.length - 1, i + 1),
      );
    } else if (key.return) {
      const item = filteredItems[selectedIndex];
      if (item) onRun(item.command);
    } else if (input === 'q' || (key.ctrl && input === 'c')) {
      onQuit();
    } else if (input === '/') {
      setSearchMode(true);
      setSearchQuery('');
      setSelectedIndex(0);
    } else if (input === 'd' && !bannerDismissed) {
      setBannerDismissed(true);
    }
  });

  const safeIndex = Math.min(
    selectedIndex,
    Math.max(0, filteredItems.length - 1),
  );
  const dividerWidth = Math.min(columns - 4, 70);
  const divider = '─'.repeat(Math.max(dividerWidth, 10));

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Stars />

      {/* Header */}
      <Box
        flexDirection="row"
        justifyContent="space-between"
        marginBottom={1}
        alignItems="flex-start"
      >
        <Box flexDirection="row" gap={2} alignItems="center">
          <Box flexDirection="column">
            {LOGO.map((line, i) => (
              <Text key={i} color="#555555">
                {line}
              </Text>
            ))}
          </Box>
          <Box flexDirection="column">
            <Box flexDirection="row" gap={1}>
              <Text bold color="#ffffff">
                uiseal
              </Text>
              <Text color="#3a3a3a">v{VERSION}</Text>
            </Box>
            <Text color="#333333">
              deterministic design-system governance
            </Text>
            <Text color="#2a2a2a" dimColor>
              {cwdDisplay()}
            </Text>
          </Box>
        </Box>
        <Box borderStyle="single" borderColor="#1e1e1e" paddingX={1}>
          <Text color="#3a3a3a">Trial · 27d</Text>
        </Box>
      </Box>

      {/* Divider */}
      <Box marginBottom={1}>
        <Text color="#1e1e1e">{divider}</Text>
      </Box>

      {/* Admin banner */}
      {!bannerDismissed && (
        <Banner text="Running in beta — feedback welcome at uiseal.io" />
      )}

      {/* Commands label */}
      <Box marginBottom={1}>
        <Text color="#333333">COMMANDS</Text>
      </Box>

      {/* Search input */}
      {searchMode && (
        <Box marginBottom={1}>
          <Text color="#555555">/ </Text>
          <Text color="#ffffff">{searchQuery}</Text>
          <Text color="#333333">▌</Text>
        </Box>
      )}

      {/* Menu items */}
      <Box flexDirection="column" marginBottom={2}>
        {filteredItems.length === 0 ? (
          <Text color="#333333">  no commands match "{searchQuery}"</Text>
        ) : (
          filteredItems.map((item, i) => {
            const isSelected = i === safeIndex;
            return (
              <Box
                key={item.command}
                flexDirection="row"
                justifyContent="space-between"
              >
                <Box flexDirection="row">
                  <Text color={isSelected ? '#888888' : '#2a2a2a'}>
                    {isSelected ? ' › ' : '   '}
                  </Text>
                  <Box
                    backgroundColor={isSelected ? '#1a1a1a' : undefined}
                    paddingX={isSelected ? 1 : 0}
                  >
                    <Text
                      color={isSelected ? '#ffffff' : '#555555'}
                      bold={isSelected}
                    >
                      {item.command.padEnd(16)}
                    </Text>
                  </Box>
                  <Text color="#333333">  {item.description}</Text>
                </Box>
                {isSelected && <Text color="#2a2a2a"> ↵ </Text>}
              </Box>
            );
          })
        )}
      </Box>

      {/* Footer */}
      <Box>
        <Text color="#2a2a2a">
          ↑↓ navigate  ↵ run  / search  q quit  d dismiss banner
        </Text>
      </Box>
    </Box>
  );
}
