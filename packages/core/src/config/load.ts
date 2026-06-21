import fs from 'node:fs';
import path from 'node:path';
import { ZodError } from 'zod';
import { uisealConfigSchema, type uisealConfig } from './schema.js';

const CANDIDATES = [
  'uiseal.config.ts',
  'uiseal.config.js',
  'uiseal.config.json',
];

export interface LoadConfigResult {
  config: uisealConfig;
  projectRoot: string;
}

export async function loadConfig(searchPath?: string): Promise<LoadConfigResult> {
  let startDir = searchPath ? path.resolve(searchPath) : process.cwd();

  // If given a file path, start from its directory.
  if (fs.existsSync(startDir) && fs.statSync(startDir).isFile()) {
    startDir = path.dirname(startDir);
  }

  // Walk up from startDir until we find a config file or reach the fs root.
  let configPath: string | undefined;
  let projectRoot: string = startDir;
  let current = startDir;
  while (true) {
    for (const name of CANDIDATES) {
      const candidate = path.join(current, name);
      if (fs.existsSync(candidate)) {
        configPath = candidate;
        projectRoot = current;
        break;
      }
    }
    if (configPath) break;
    const parent = path.dirname(current);
    if (parent === current) break; // reached filesystem root
    current = parent;
  }

  if (!configPath) {
    throw new Error(
      `No config file found. Create uiseal.config.ts or uiseal.config.json in ${startDir}`,
    );
  }

  let raw: unknown;
  if (configPath.endsWith('.json')) {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } else {
    // Dynamic import works when the runtime supports TypeScript (tsx, ts-node, vitest).
    const mod = await import(configPath);
    raw = mod.default ?? mod;
  }

  try {
    const config = uisealConfigSchema.parse(raw);
    return { config, projectRoot };
  } catch (err) {
    if (err instanceof ZodError) {
      const issue = err.issues[0]!;
      const field = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      throw new Error(`Invalid config at "${field}": ${issue.message}`);
    }
    throw err;
  }
}
