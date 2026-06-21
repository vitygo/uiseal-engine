import { vi, describe, it, expect, beforeEach } from 'vitest';

// vi.hoisted variables are accessible inside vi.mock factory functions.
const {
  mockGetInput,
  mockSetFailed,
  mockError,
  mockWarning,
  mockInfo,
} = vi.hoisted(() => ({
  mockGetInput: vi.fn((name: string) => {
    if (name === 'config') return 'uiseal.config.ts';
    if (name === 'report') return 'false';
    return '';
  }),
  mockSetFailed: vi.fn(),
  mockError: vi.fn(),
  mockWarning: vi.fn(),
  mockInfo: vi.fn(),
}));

const { mockExistsSync, mockReadFileSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn().mockReturnValue(true),
  mockReadFileSync: vi.fn().mockReturnValue(''),
}));

const { mockGlob } = vi.hoisted(() => ({
  mockGlob: vi.fn().mockResolvedValue(['src/Button.tsx']),
}));

const { mockLoadConfig } = vi.hoisted(() => ({
  mockLoadConfig: vi.fn().mockResolvedValue({
    config: {
      tokens: {
        colors: { '--color-primary': '#0055ff' },
        spacing: [4, 8, 16],
        fontSizes: [12, 14, 16],
        fontFamilies: ['Inter'],
        radii: [4, 8],
      },
      rules: { 'no-hardcoded-color': 'error' },
      ignore: [],
      baseline: { enabled: false, path: '.uiseal-baseline.json' },
    },
    projectRoot: '/project',
  }),
}));

vi.mock('@actions/core', () => ({
  getInput: mockGetInput,
  setFailed: mockSetFailed,
  error: mockError,
  warning: mockWarning,
  info: mockInfo,
}));

vi.mock('@actions/github', () => ({
  context: {
    eventName: 'push',
    repo: { owner: 'acme', repo: 'web' },
    payload: {},
  },
  getOctokit: vi.fn(),
}));

vi.mock('glob', () => ({
  glob: mockGlob,
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
  },
}));

// Partial mock: mock only loadConfig so tests control the config; keep analyze + allRules real.
vi.mock('@uiseal/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@uiseal/core')>();
  return { ...actual, loadConfig: mockLoadConfig };
});

import { run } from './index.js';

const VIOLATING_CONTENT = `
export function Button() {
  return <button style={{ color: '#ff0000' }}>Click</button>;
}
`;

// Exact match to --color-primary so fix.suggested is populated.
const VIOLATING_WITH_FIX = `
export function Button() {
  return <button style={{ color: '#0055ff' }}>Click</button>;
}
`;

const CLEAN_CONTENT = `
export function Button() {
  return <button style={{ color: 'var(--color-primary)' }}>Click</button>;
}
`;

describe('github action entrypoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetInput.mockImplementation((name: string) => {
      if (name === 'config') return 'uiseal.config.ts';
      if (name === 'report') return 'false';
      return '';
    });
    mockExistsSync.mockReturnValue(true);
    mockLoadConfig.mockResolvedValue({
      config: {
        tokens: {
          colors: { '--color-primary': '#0055ff' },
          spacing: [4, 8, 16],
          fontSizes: [12, 14, 16],
          fontFamilies: ['Inter'],
          radii: [4, 8],
        },
        rules: { 'no-hardcoded-color': 'error' },
        ignore: [],
        baseline: { enabled: false, path: '.uiseal-baseline.json' },
      },
      projectRoot: '/project',
    });
    mockGlob.mockResolvedValue(['src/Button.tsx']);
  });

  it('calls setFailed when error-severity violations exist', async () => {
    mockReadFileSync.mockReturnValue(VIOLATING_CONTENT);

    await run();

    expect(mockSetFailed).toHaveBeenCalledOnce();
    expect(mockSetFailed.mock.calls[0]![0]).toMatch(/violation/i);
  });

  it('does not call setFailed for a clean file', async () => {
    mockReadFileSync.mockReturnValue(CLEAN_CONTENT);

    await run();

    expect(mockSetFailed).not.toHaveBeenCalled();
  });

  it('includes suggested fix in the annotation message when available', async () => {
    mockReadFileSync.mockReturnValue(VIOLATING_WITH_FIX);

    await run();

    const annotationMessages = [
      ...mockError.mock.calls.map((c) => c[0] as string),
      ...mockWarning.mock.calls.map((c) => c[0] as string),
    ];
    expect(annotationMessages.some((m) => m.includes('suggested fix'))).toBe(true);
  });

  it('does not call setFailed for warning-only violations', async () => {
    mockLoadConfig.mockResolvedValueOnce({
      config: {
        tokens: {
          colors: { '--color-primary': '#0055ff' },
          spacing: [4, 8, 16],
          fontSizes: [12, 14, 16],
          fontFamilies: ['Inter'],
          radii: [4, 8],
        },
        rules: { 'no-hardcoded-color': 'warn' },
        ignore: [],
        baseline: { enabled: false, path: '.uiseal-baseline.json' },
      },
      projectRoot: '/project',
    });
    mockReadFileSync.mockReturnValue(VIOLATING_CONTENT);

    await run();

    expect(mockSetFailed).not.toHaveBeenCalled();
    expect(mockWarning).toHaveBeenCalled();
  });
});
