import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@uiseal/core', async () => {
  return {
    loadConfig: vi.fn().mockResolvedValue({
      config: {
        tokens: { colors: {}, spacing: [], fontSizes: [], fontFamilies: [], radii: [] },
        rules: {},
        ignore: [],
        baseline: { enabled: false, path: '.uiseal-baseline.json' },
      },
      projectRoot: '/project',
    }),
    analyze: vi.fn().mockReturnValue([]),
    formatReport: vi.fn().mockReturnValue(''),
    allRules: [],
    resolveBaselineResult: vi.fn().mockReturnValue({
      violations: [],
      baseline: {
        status: 'disabled',
        resolvedPath: '/project/.uiseal-baseline.json',
        counts: { total: 0, baselined: 0, new: 0 },
      },
    }),
    fingerprintViolations: vi.fn().mockReturnValue([]),
    writeBaseline: vi.fn(),
    fetchAppConfig: vi.fn().mockResolvedValue({
      betaMode: false,
      bannerText: null,
      bannerType: null,
      bannerActive: false,
      cachedAt: new Date(),
      source: 'offline',
    }),
  };
});

vi.mock('glob', () => ({
  glob: vi.fn().mockResolvedValue([]),
}));

describe('check command — offline by default', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not call fetch when --report flag is absent', async () => {
    const { runCheck } = await import('../check-runner.js');
    await runCheck({});
    expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled();
  });

  it('does not call fetch when --staged is set but --report is absent', async () => {
    const { execSync } = await import('node:child_process');
    vi.mock('node:child_process', () => ({
      execSync: vi.fn().mockReturnValue(''),
    }));

    const { runCheck } = await import('../check-runner.js');
    await runCheck({ staged: true });
    expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled();

    vi.unmock('node:child_process');
  });
});
