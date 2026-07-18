import { defineConfig } from 'vitest/config';
import os from 'node:os';

export default defineConfig({
  test: {
    globalSetup: ['./src/__tests__/global-setup.ts'],
    // Most tests here spawn a real `node` child process running the built
    // CLI (spawnSync), which itself loads heavy parsers (TypeScript, Vue,
    // Angular, Svelte compilers). Under concurrent load — several test
    // files each spawning multiple subprocesses at once — a single
    // invocation can take longer than vitest's 5000ms default, even though
    // it completes in 1-3s in isolation. This raises headroom rather than
    // masking a real bug (every affected test passes reliably alone).
    testTimeout: 20000,
    // Cap concurrent test-file workers so fewer spawnSync child processes
    // compete for CPU at once — the actual source of the slowdown above,
    // not just something a longer timeout papers over. Half the CPU count
    // (min 2) still parallelizes meaningfully without letting every test
    // file's subprocesses pile up simultaneously.
    poolOptions: {
      forks: {
        maxForks: Math.max(2, Math.floor(os.cpus().length / 2)),
      },
    },
  },
});
