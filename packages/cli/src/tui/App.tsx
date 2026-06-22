import { useState, useEffect, useRef } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import Home from './screens/Home.js';
import Scanning from './screens/Scanning.js';
import Results from './screens/Results.js';
import BaselineMenu from './screens/BaselineMenu.js';
import DiffInput from './screens/DiffInput.js';
import CommandOutput from './screens/CommandOutput.js';
import type { CheckResult } from '../check-runner.js';

type Screen =
  | 'home'
  | 'scanning'
  | 'results'
  | 'launching'
  | 'baseline-menu'
  | 'diff-input'
  | 'command-output'
  | 'init-confirm';

function InitConfirm({
  path,
  onForce,
  onBack,
}: {
  path: string;
  onForce: () => void;
  onBack: () => void;
}) {
  useInput((input, key) => {
    if (input === 'r') onForce();
    else if (input === 'b' || input === 'h' || key.escape) onBack();
  });

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
      <Text color="yellow">Config already exists at {path}</Text>
      <Box flexDirection="column">
        <Text>{'  '}<Text color="cyan">r</Text>{'  · reinitialize (--force overwrite)'}</Text>
        <Text>{'  '}<Text color="cyan">b/h</Text>{' · cancel'}</Text>
      </Box>
    </Box>
  );
}

interface AppProps {
  onLaunchCommand: (args: string[]) => void;
}

export default function App({ onLaunchCommand }: AppProps) {
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>('home');
  const [activeCommand, setActiveCommand] = useState('');
  const [results, setResults] = useState<CheckResult | null>(null);
  const [commandTitle, setCommandTitle] = useState('');
  const [commandOutput, setCommandOutput] = useState('');
  const [commandLoading, setCommandLoading] = useState(false);
  const [initConfirmPath, setInitConfirmPath] = useState('');
  const runningProcRef = useRef<ChildProcess | null>(null);

  useEffect(() => {
    if (screen === 'launching' && activeCommand) {
      onLaunchCommand([activeCommand]);
      exit();
    }
  }, [screen, activeCommand]); // eslint-disable-line react-hooks/exhaustive-deps

  const runInlineCommand = (title: string, args: string[]) => {
    if (runningProcRef.current) {
      runningProcRef.current.kill();
      runningProcRef.current = null;
    }

    setCommandTitle(title);
    setCommandOutput('');
    setCommandLoading(true);
    setScreen('command-output');

    const proc = spawn(process.execPath, [process.argv[1]!, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    runningProcRef.current = proc;

    let output = '';
    proc.stdout!.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    proc.stderr!.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    proc.on('close', () => {
      runningProcRef.current = null;
      setCommandOutput(output.trim() || '(no output)');
      setCommandLoading(false);
    });
  };

  const handleRun = (cmd: string) => {
    if (cmd === 'check') {
      setActiveCommand(cmd);
      setScreen('scanning');
    } else if (cmd === 'baseline') {
      setScreen('baseline-menu');
    } else if (cmd === 'diff') {
      setScreen('diff-input');
    } else if (cmd === 'init') {
      const candidates = ['uiseal.config.json', 'uiseal.config.ts'];
      const existing = candidates.find((f) => existsSync(join(process.cwd(), f)));
      if (existing) {
        setInitConfirmPath(join(process.cwd(), existing));
        setScreen('init-confirm');
      } else {
        setActiveCommand(cmd);
        setScreen('launching');
      }
    } else {
      // install-hooks: needs full terminal control — exit TUI
      setActiveCommand(cmd);
      setScreen('launching');
    }
  };

  const handleBack = () => {
    if (runningProcRef.current) {
      runningProcRef.current.kill();
      runningProcRef.current = null;
    }
    setScreen('home');
    setResults(null);
  };

  const handleComplete = (result: CheckResult) => {
    setResults(result);
    setScreen('results');
  };

  if (screen === 'launching') {
    return (
      <Box paddingX={2} paddingY={1}>
        <Text color="#666666">Launching uiseal {activeCommand}…</Text>
      </Box>
    );
  }

  if (screen === 'init-confirm') {
    return (
      <InitConfirm
        path={initConfirmPath}
        onForce={() => {
          onLaunchCommand(['init', '--force']);
          exit();
        }}
        onBack={handleBack}
      />
    );
  }

  if (screen === 'baseline-menu') {
    return (
      <BaselineMenu
        onSelect={(subcmd) =>
          runInlineCommand(`baseline ${subcmd}`, ['baseline', subcmd])
        }
        onBack={handleBack}
      />
    );
  }

  if (screen === 'diff-input') {
    return (
      <DiffInput
        onSubmit={(branch) =>
          runInlineCommand(`diff vs ${branch}`, ['diff', '--markdown', branch])
        }
        onBack={handleBack}
      />
    );
  }

  if (screen === 'command-output') {
    return (
      <CommandOutput
        title={commandTitle}
        output={commandOutput}
        isLoading={commandLoading}
        onBack={handleBack}
      />
    );
  }

  if (screen === 'scanning') {
    return <Scanning onComplete={handleComplete} onBack={handleBack} />;
  }

  if (screen === 'results') {
    return <Results result={results!} onBack={handleBack} onQuit={exit} />;
  }

  return <Home onRun={handleRun} onQuit={exit} />;
}
