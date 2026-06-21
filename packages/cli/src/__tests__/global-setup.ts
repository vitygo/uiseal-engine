import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_ROOT = resolve(__dirname, '../..');

export function setup(): void {
  if (!existsSync(resolve(CLI_ROOT, 'dist/index.js'))) {
    const result = spawnSync('pnpm', ['run', 'build'], {
      cwd: CLI_ROOT,
      stdio: 'inherit',
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      throw new Error('CLI build failed in globalSetup');
    }
  }
}
