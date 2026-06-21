import fs from 'node:fs';
import path from 'node:path';

/**
 * Update baseline.enabled (and optionally baseline.path) in uiseal.config.json.
 * Only operates on JSON configs — TS/JS configs must be edited manually.
 * Returns the path that was updated, or null if no JSON config was found.
 */
export function setBaselineEnabled(
  projectRoot: string,
  enabled: boolean,
  baselinePath?: string,
): string | null {
  const configPath = path.join(projectRoot, 'uiseal.config.json');
  if (!fs.existsSync(configPath)) return null;

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
  } catch {
    throw new Error(`Failed to parse ${configPath}`);
  }

  if (typeof raw['baseline'] !== 'object' || raw['baseline'] === null) {
    raw['baseline'] = {};
  }
  const bl = raw['baseline'] as Record<string, unknown>;
  bl['enabled'] = enabled;
  if (baselinePath !== undefined) bl['path'] = baselinePath;

  fs.writeFileSync(configPath, JSON.stringify(raw, null, 2) + '\n', 'utf8');
  return configPath;
}
