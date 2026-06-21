import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.mock calls are hoisted before imports, so these intercept all module
// imports made by diff.ts when it is first loaded in this test file.

vi.mock('node:child_process', () => ({
  execSync: vi.fn().mockImplementation((cmd: string, opts?: { encoding?: string }) => {
    // Stash output needs to be a string so .trim() works.
    if (opts?.encoding === 'utf8') return 'No local changes to save';
    return undefined;
  }),
  spawnSync: vi.fn().mockReturnValue({
    status: 0,
    pid: 1,
    signal: null,
    stdout: Buffer.from(''),
    stderr: Buffer.from(''),
    output: [],
  }),
}));

vi.mock('@uiseal/core', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    config: {
      tokens: { colors: {}, spacing: [], fontSizes: [], fontFamilies: [], radii: [] },
      rules: {},
      ignore: [],
      baseline: { enabled: false, path: '.uiseal-baseline.json' },
    },
    projectRoot: '/tmp',
  }),
  analyze: vi.fn().mockReturnValue([]),
  allRules: [],
  diffScans: vi.fn().mockReturnValue({
    verdict: 'ok',
    blocking: [],
    warnings: [],
    newCount: 0,
    fixedCount: 0,
    netChange: 0,
    fileImpact: [],
    autoFixableCount: 0,
    securityIssuesFound: 0,
  }),
  formatDiffAsMarkdown: vi.fn().mockReturnValue(''),
}));

vi.mock('glob', () => ({ glob: vi.fn().mockResolvedValue([]) }));

describe('diff command — shell injection safety', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('passes base branch with shell metacharacters as a literal argv element via spawnSync', async () => {
    const { spawnSync: spawnSyncMock } = await import('node:child_process');
    const { diffCommand } = await import('../commands/diff.js');

    // A base value an attacker might supply to try to inject a shell command.
    // With execSync(`git checkout ${base}`) this would run 'touch /tmp/pwned'.
    // With spawnSync('git', ['checkout', base]) the entire string is passed as
    // a single argv element to git — no shell is involved, no injection occurs.
    const maliciousBase = 'main; touch /tmp/pwned';

    await diffCommand.parseAsync([maliciousBase], { from: 'user' });

    // The git checkout call must use the array form — not a shell string.
    expect(vi.mocked(spawnSyncMock)).toHaveBeenCalledWith(
      'git',
      ['checkout', maliciousBase],
      expect.objectContaining({ stdio: 'ignore' }),
    );

    // The injected portion '; touch /tmp/pwned' is passed verbatim as git's
    // argument and not interpreted by a shell, so git simply rejects it as an
    // invalid ref — no file is created.
    const { existsSync } = await import('node:fs');
    expect(existsSync('/tmp/pwned')).toBe(false);
  });
});
