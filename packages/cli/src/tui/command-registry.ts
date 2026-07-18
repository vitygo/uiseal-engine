export interface FlagDef {
  name: string;
  alias?: string;
  description: string;
  type: 'boolean' | 'string';
  values?: string[];
}

export interface CommandDef {
  name: string;
  description: string;
  flags: FlagDef[];
  subcommands?: CommandDef[];
}

export const COMMANDS: CommandDef[] = [
  {
    name: 'check',
    description: 'Scan for design-system violations',
    flags: [
      { name: '--config', alias: '-c', description: 'Directory containing uiseal.config.{ts,js,json}', type: 'string' },
      { name: '--staged', description: 'Only check files staged in git (pre-commit use case)', type: 'boolean' },
      { name: '--report', description: 'POST aggregated metrics to uiseal_API_URL', type: 'boolean' },
      { name: '--update-baseline', description: 'Scan, write all current violations to the baseline file, exit 0', type: 'boolean' },
      { name: '--no-baseline', description: 'Ignore the baseline entirely and report all violations', type: 'boolean' },
      { name: '--verbose', description: 'Show full verbose output even when violation count exceeds 50', type: 'boolean' },
      { name: '--fix', description: 'Apply suggested fixes to source files', type: 'boolean' },
      { name: '--dry-run', description: 'Show what --fix would change without writing any files', type: 'boolean' },
      { name: '--format', description: 'Output format (default: pretty)', type: 'string', values: ['pretty', 'json', 'sarif'] },
      { name: '--output', description: 'Write output to a file instead of stdout', type: 'string' },
    ],
  },
  {
    name: 'init',
    description: 'Initialize uiseal.config.json',
    flags: [
      { name: '--force', alias: '-f', description: 'Overwrite an existing config file', type: 'boolean' },
      { name: '--from', description: 'Token source to use (default: auto-detect)', type: 'string', values: ['tailwind', 'css-vars', 'code'] },
    ],
  },
  {
    name: 'baseline',
    description: 'Manage design debt baseline',
    flags: [],
    subcommands: [
      {
        name: 'update',
        description: 'Rescan and rewrite the baseline (same as check --update-baseline)',
        flags: [{ name: '--config', alias: '-c', description: 'Directory containing uiseal config', type: 'string' }],
      },
      {
        name: 'disable',
        description: 'Set baseline.enabled = false in uiseal.config.json',
        flags: [{ name: '--config', alias: '-c', description: 'Directory containing uiseal config', type: 'string' }],
      },
      {
        name: 'status',
        description: 'Print baseline path, enabled state, and debt counts',
        flags: [{ name: '--config', alias: '-c', description: 'Directory containing uiseal config', type: 'string' }],
      },
      {
        name: 'prune',
        description: 'Remove fingerprints that no longer match current code',
        flags: [{ name: '--config', alias: '-c', description: 'Directory containing uiseal config', type: 'string' }],
      },
    ],
  },
  {
    name: 'diff',
    description: 'Compare against base branch',
    flags: [{ name: '--markdown', description: 'Output markdown instead of terminal summary', type: 'boolean' }],
  },
  {
    name: 'drift',
    description: 'Detect drift between token source and code',
    flags: [
      { name: '--source', description: 'Token source (default: auto-detect)', type: 'string', values: ['tailwind', 'css-vars', 'code-scan'] },
      { name: '--config', alias: '-c', description: 'Directory to resolve the project from', type: 'string' },
      { name: '--json', description: 'Output the drift report as JSON (for CI/scripting)', type: 'boolean' },
      { name: '--verbose', description: 'Show every drifted value, not just the top ones', type: 'boolean' },
    ],
  },
  {
    name: 'watch',
    description: 'Live file watching with incremental scanning',
    flags: [
      { name: '--config', alias: '-c', description: 'Directory containing uiseal.config.{ts,js,json}', type: 'string' },
      { name: '--debounce', description: 'Debounce delay in milliseconds (default 300)', type: 'string' },
      { name: '--clear', description: 'Clear terminal on each update (default)', type: 'boolean' },
      { name: '--no-clear', description: 'Do not clear the terminal on each update', type: 'boolean' },
    ],
  },
  {
    name: 'install-hooks',
    description: 'Install git pre-commit hooks',
    flags: [],
  },
];

function matchFlag(token: string, flags: FlagDef[]): FlagDef | undefined {
  return flags.find((f) => f.name === token || f.alias === token);
}

interface FlagRegionResult {
  usedFlags: Set<string>;
  pendingValueFlag: FlagDef | undefined;
}

// Walks a run of "committed" tokens (flag names / values that are already
// fully typed, i.e. followed by whitespace) to figure out which flags have
// been used and whether the very last one is a string flag still awaiting
// its value.
function walkFlagRegion(tokens: string[], flags: FlagDef[]): FlagRegionResult {
  const usedFlags = new Set<string>();
  let pendingValueFlag: FlagDef | undefined;
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i]!;
    const flagDef = matchFlag(tok, flags);
    if (flagDef) {
      usedFlags.add(flagDef.name);
      pendingValueFlag = undefined;
      if (flagDef.type === 'string') {
        if (i + 1 < tokens.length) {
          i += 2; // value already committed too
        } else {
          pendingValueFlag = flagDef; // flag typed, value not yet committed
          i += 1;
        }
      } else {
        i += 1;
      }
    } else {
      pendingValueFlag = undefined;
      i += 1; // positional arg / unrecognized token
    }
  }
  return { usedFlags, pendingValueFlag };
}

function suggestFlagsOrValues(region: string[], endsWithSpace: boolean, flags: FlagDef[]): string[] {
  const effectiveLen = endsWithSpace ? region.length : Math.max(0, region.length - 1);
  const committed = region.slice(0, effectiveLen);
  const { usedFlags, pendingValueFlag } = walkFlagRegion(committed, flags);
  const remainingFlags = () => flags.filter((f) => !usedFlags.has(f.name)).map((f) => f.name);

  if (endsWithSpace) {
    if (pendingValueFlag?.values) return pendingValueFlag.values;
    return remainingFlags();
  }

  const current = region[effectiveLen] ?? '';
  if (current.startsWith('-')) {
    return remainingFlags().filter((name) => name.startsWith(current));
  }
  if (pendingValueFlag?.values) {
    return pendingValueFlag.values.filter((v) => v.startsWith(current));
  }
  return [];
}

export function getCompletions(input: string): string[] {
  const endsWithSpace = input.length === 0 || /\s$/.test(input);
  const tokens = input.trim().split(/\s+/).filter(Boolean);

  if (tokens.length === 0) {
    return COMMANDS.map((c) => c.name);
  }

  if (tokens.length === 1 && !endsWithSpace) {
    const prefix = tokens[0]!;
    return COMMANDS.filter((c) => c.name.startsWith(prefix)).map((c) => c.name);
  }

  const command = COMMANDS.find((c) => c.name === tokens[0]);
  if (!command) return [];

  if (command.subcommands) {
    if (tokens.length === 1 && endsWithSpace) {
      return command.subcommands.map((s) => s.name);
    }
    if (tokens.length === 2 && !endsWithSpace) {
      const prefix = tokens[1]!;
      return command.subcommands.filter((s) => s.name.startsWith(prefix)).map((s) => s.name);
    }
    const subcommand = command.subcommands.find((s) => s.name === tokens[1]);
    if (!subcommand) return [];
    return suggestFlagsOrValues(tokens.slice(2), endsWithSpace, subcommand.flags);
  }

  return suggestFlagsOrValues(tokens.slice(1), endsWithSpace, command.flags);
}

export interface ParsedCommandLine {
  command: string;
  args: string[];
}

export function parseCommandLine(input: string): ParsedCommandLine | null {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  return { command: tokens[0]!, args: tokens.slice(1) };
}

export function findFlagDescription(commandName: string, flagName: string): string | undefined {
  const command = COMMANDS.find((c) => c.name === commandName);
  if (!command) return undefined;
  return command.flags.find((f) => f.name === flagName)?.description;
}
