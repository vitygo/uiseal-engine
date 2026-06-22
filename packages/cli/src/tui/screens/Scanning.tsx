import { useState, useEffect, useRef } from 'react';
import { Box, Text, useAnimation, useInput } from 'ink';
import path from 'node:path';
import fs from 'node:fs';
import { glob } from 'glob';
import { loadConfig, analyze, allRules, resolveBaselineResult } from '@uiseal/core';
import type { CheckResult } from '../../check-runner.js';

const SPINNER_FRAMES = [
  '⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏',
];

type Phase = 'resolving' | 'reading' | 'analyzing' | 'done' | 'error';

interface ScanState {
  phase: Phase;
  totalFiles: number;
  filesRead: number;
  currentFile: string;
  recentViolations: string[];
  errorMessage: string;
}

const INITIAL_STATE: ScanState = {
  phase: 'resolving',
  totalFiles: 0,
  filesRead: 0,
  currentFile: '',
  recentViolations: [],
  errorMessage: '',
};

interface ScanningProps {
  onComplete: (result: CheckResult) => void;
  onBack: () => void;
}

const BAR_WIDTH = 40;

export default function Scanning({ onComplete, onBack }: ScanningProps) {
  const { frame } = useAnimation({ interval: 80 });
  const [state, setState] = useState<ScanState>(INITIAL_STATE);
  const cancelledRef = useRef(false);

  useInput((input, key) => {
    if (key.escape || input === 'q') onBack();
  });

  useEffect(() => {
    cancelledRef.current = false;

    async function runScan() {
      try {
        const searchFrom = process.cwd();
        const { config, projectRoot } = await loadConfig(searchFrom);

        if (cancelledRef.current) return;

        const filePaths = await glob('**/*.{tsx,jsx,css,module.css}', {
          cwd: projectRoot,
          ignore: ['**/node_modules/**', ...config.ignore],
          absolute: true,
        });

        if (cancelledRef.current) return;

        setState((s) => ({ ...s, phase: 'reading', totalFiles: filePaths.length }));

        const files = new Map<string, string>();
        let lastUiUpdate = Date.now();

        for (const fp of filePaths) {
          if (cancelledRef.current) return;
          const abs = path.resolve(fp);
          if (fs.existsSync(abs)) {
            files.set(abs, fs.readFileSync(abs, 'utf8'));
          }
          const now = Date.now();
          if (now - lastUiUpdate >= 40) {
            lastUiUpdate = now;
            const relFile = path.relative(projectRoot, abs);
            setState((s) => ({ ...s, filesRead: files.size, currentFile: relFile }));
            await new Promise<void>((r) => setTimeout(r, 0));
          }
        }

        if (cancelledRef.current) return;

        setState((s) => ({
          ...s,
          phase: 'analyzing',
          filesRead: files.size,
          currentFile: '',
        }));

        await new Promise<void>((r) => setTimeout(r, 0));

        const hasBaselineFile = fs.existsSync(
          path.join(process.cwd(), '.uiseal-baseline.json'),
        );

        const { violations: rawViolations } = await analyze({
          files,
          config,
          rules: allRules,
          projectRoot,
        });

        if (cancelledRef.current) return;

        const { violations: newViolations, baseline } = resolveBaselineResult(
          rawViolations,
          config,
          projectRoot,
        );
        const allViolations = rawViolations;
        const baselineCount =
          hasBaselineFile && baseline.status === 'active'
            ? baseline.counts.baselined
            : 0;

        const recent = rawViolations
          .slice(0, 8)
          .map((v) => `${path.relative(projectRoot, v.file)}:${v.line}  ${v.ruleId}`);

        setState((s) => ({ ...s, phase: 'done', recentViolations: recent }));

        await new Promise<void>((r) => setTimeout(r, 350));

        if (!cancelledRef.current) {
          onComplete({
            violations: allViolations,
            hasErrors: allViolations.some((v) => v.severity === 'error'),
            baseline,
            newViolations,
            allViolations,
            baselineCount,
          });
        }
      } catch (err) {
        if (!cancelledRef.current) {
          setState((s) => ({
            ...s,
            phase: 'error',
            errorMessage: (err as Error).message,
          }));
        }
      }
    }

    runScan();
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const { phase, totalFiles, filesRead, currentFile, recentViolations, errorMessage } =
    state;

  const spinnerChar = SPINNER_FRAMES[frame % SPINNER_FRAMES.length]!;
  const progress = totalFiles > 0 ? filesRead / totalFiles : 0;
  const filled = Math.floor(progress * BAR_WIDTH);
  const bar = '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled);

  const phaseLabel =
    phase === 'resolving'
      ? 'Resolving files…'
      : phase === 'reading'
        ? `Scanning · ${filesRead} / ${totalFiles} files`
        : phase === 'analyzing'
          ? 'Analyzing…'
          : phase === 'done'
            ? 'Complete'
            : 'Error';

  const leadIcon =
    phase === 'done'
      ? '✓'
      : phase === 'error'
        ? '✗'
        : spinnerChar;

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      {/* Spinner + phase label */}
      <Box flexDirection="row" gap={2} marginBottom={1}>
        <Text
          color={
            phase === 'error' ? '#666666' : phase === 'done' ? '#666666' : '#888888'
          }
        >
          {leadIcon}
        </Text>
        <Text color="#888888">{phaseLabel}</Text>
      </Box>

      {/* Current file */}
      {currentFile !== '' && (
        <Box
          borderStyle="single"
          borderColor="#1e1e1e"
          paddingX={1}
          marginBottom={1}
        >
          <Text color="#333333" dimColor>
            {currentFile}
          </Text>
        </Box>
      )}

      {/* Progress bar */}
      {(phase === 'reading' || phase === 'analyzing') && (
        <Box marginBottom={1}>
          <Text color="#3a3a3a">{bar}</Text>
        </Box>
      )}

      {/* Live violations log */}
      {recentViolations.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="#2a2a2a">recent violations</Text>
          {recentViolations.slice(-5).map((v, i) => (
            <Text key={i} color="#3a3a3a" dimColor>
              {'  '}
              {v}
            </Text>
          ))}
        </Box>
      )}

      {/* Error message */}
      {phase === 'error' && (
        <Box marginTop={1}>
          <Text color="#666666">{errorMessage}</Text>
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={2}>
        <Text color="#222222">esc · back</Text>
      </Box>
    </Box>
  );
}
