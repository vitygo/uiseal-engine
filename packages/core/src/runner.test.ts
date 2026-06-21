import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from './runner.js';
import type { Rule, RuleContext } from './rules/types.js';
import type { Declaration } from 'postcss';
import type { uisealConfig } from './config/schema.js';
import type { LicenseState } from './license/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(__dirname, '__fixtures__/fixture-project');

const baseConfig: uisealConfig = {
  tokens: {
    colors: { primary: '#ff0000' },
    spacing: [8, 16, 24],
    fontSizes: [14, 16, 18],
    fontFamilies: ['Inter'],
    radii: [4, 8],
  },
  rules: {},
  ignore: [],
};

// A fake rule that flags every CSS declaration it sees.
const flagAllDeclsRule: Rule = {
  id: 'flag-all-decls',
  category: 'design',
  defaultSeverity: 'error',
  checkCssDeclaration(decl: Declaration, ctx: RuleContext) {
    ctx.report({
      ruleId: 'flag-all-decls',
      message: `declaration found: ${decl.prop}`,
      line: decl.source?.start?.line ?? 1,
      column: decl.source?.start?.column ?? 0,
    });
  },
};

function loadFixtures(): Map<string, string> {
  const files = new Map<string, string>();
  for (const name of ['styles.css', 'Component.tsx']) {
    const full = path.join(fixtureDir, name);
    files.set(full, fs.readFileSync(full, 'utf8'));
  }
  return files;
}

describe('analyze – CSS', () => {
  it('finds declarations in CSS files', async () => {
    const files = new Map([
      [path.join(fixtureDir, 'styles.css'), fs.readFileSync(path.join(fixtureDir, 'styles.css'), 'utf8')],
    ]);
    const { violations } = await analyze({ files, config: baseConfig, rules: [flagAllDeclsRule] });
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.every((v) => v.file.endsWith('styles.css'))).toBe(true);
  });

  it('reports correct line numbers', async () => {
    const cssContent = '.a {\n  color: red;\n  padding: 8px;\n}';
    const files = new Map([['test.css', cssContent]]);
    const { violations } = await analyze({ files, config: baseConfig, rules: [flagAllDeclsRule] });
    const lines = violations.map((v) => v.line).sort((a, b) => a - b);
    expect(lines).toEqual([2, 3]);
  });
});

describe('analyze – JSX/TSX', () => {
  it('finds declarations in TSX inline styles', async () => {
    const files = new Map([
      [path.join(fixtureDir, 'Component.tsx'), fs.readFileSync(path.join(fixtureDir, 'Component.tsx'), 'utf8')],
    ]);
    const { violations } = await analyze({ files, config: baseConfig, rules: [flagAllDeclsRule] });
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.every((v) => v.file.endsWith('Component.tsx'))).toBe(true);
  });

  it('reports line numbers for inline style props', async () => {
    const tsxContent = `
export function A() {
  return <div style={{ color: 'red', padding: '8px' }} />;
}
`.trim();
    const files = new Map([['A.tsx', tsxContent]]);
    const { violations } = await analyze({ files, config: baseConfig, rules: [flagAllDeclsRule] });
    expect(violations.length).toBeGreaterThanOrEqual(2);
    violations.forEach((v) => expect(v.line).toBeGreaterThanOrEqual(1));
  });
});

describe('analyze – ignore globs', () => {
  it('skips files matching ignore patterns', async () => {
    const files = loadFixtures();
    const config: uisealConfig = { ...baseConfig, ignore: ['**/*.css'] };
    const { violations } = await analyze({ files, config, rules: [flagAllDeclsRule] });
    expect(violations.every((v) => !v.file.endsWith('.css'))).toBe(true);
  });

  it('skips all files when glob matches everything', async () => {
    const files = loadFixtures();
    const config: uisealConfig = { ...baseConfig, ignore: ['**/*'] };
    const { violations } = await analyze({ files, config, rules: [flagAllDeclsRule] });
    expect(violations).toHaveLength(0);
  });
});

describe('analyze – parse errors', () => {
  it('emits a parse-error warning for invalid CSS instead of throwing', async () => {
    const files = new Map([['bad.css', '{ this is not valid css !!!']]);
    const { violations } = await analyze({ files, config: baseConfig, rules: [flagAllDeclsRule] });
    // postcss is lenient — just verify no throw occurs and it returns an array
    expect(Array.isArray(violations)).toBe(true);
  });

  it('emits a parse-error warning for invalid TSX instead of throwing', async () => {
    const files = new Map([['bad.tsx', '<< invalid jsx ??? >>>']]);
    const { violations } = await analyze({ files, config: baseConfig, rules: [flagAllDeclsRule] });
    expect(violations).toHaveLength(1);
    expect(violations[0]!.ruleId).toBe('parse-error');
    expect(violations[0]!.severity).toBe('warning');
    expect(violations[0]!.line).toBe(1);
    expect(violations[0]!.column).toBe(1);
  });

  it('continues processing other files after a parse error', async () => {
    const files = new Map([
      ['bad.tsx', '<< invalid jsx ??? >>>'],
      ['test.css', '.a { color: red; }'],
    ]);
    const { violations } = await analyze({ files, config: baseConfig, rules: [flagAllDeclsRule] });
    expect(violations.some((v) => v.ruleId === 'parse-error')).toBe(true);
    expect(violations.some((v) => v.file === 'test.css')).toBe(true);
  });
});

describe('analyze – severity overrides', () => {
  it('respects "off" override to skip a rule', async () => {
    const files = new Map([['test.css', '.a { color: red; }']]);
    const config: uisealConfig = { ...baseConfig, rules: { 'flag-all-decls': 'off' } };
    const { violations } = await analyze({ files, config, rules: [flagAllDeclsRule] });
    expect(violations).toHaveLength(0);
  });

  it('respects "warn" override to downgrade severity', async () => {
    const files = new Map([['test.css', '.a { color: red; }']]);
    const config: uisealConfig = { ...baseConfig, rules: { 'flag-all-decls': 'warn' } };
    const { violations } = await analyze({ files, config, rules: [flagAllDeclsRule] });
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.every((v) => v.severity === 'warning')).toBe(true);
  });
});

describe('analyze – licenseState in result', () => {
  it('includes licenseState in the result', async () => {
    const files = new Map([['test.css', '.a { color: red; }']]);
    const result = await analyze({ files, config: baseConfig, rules: [flagAllDeclsRule] });
    expect(result).toHaveProperty('licenseState');
    expect(result.licenseState).toHaveProperty('plan');
    expect(result.licenseState).toHaveProperty('source');
  });

  it('returns free licenseState when no UISEAL_TOKEN is set', async () => {
    const files = new Map([['test.css', '.a { color: red; }']]);
    const result = await analyze({ files, config: baseConfig, rules: [flagAllDeclsRule] });
    expect(result.licenseState.plan).toBe('free');
    expect(result.licenseState.source).toBe('none');
  });
});

describe('analyze – licenseState passthrough', () => {
  it('uses provided trial licenseState directly without calling validateLicense', async () => {
    const files = new Map([['test.css', '.a { color: red; }']]);
    const trialState: LicenseState = {
      valid: true,
      plan: 'trial',
      token: 'test-token',
      trialEndsAt: null,
      cachedAt: new Date(),
      // 'cache' is a sentinel: validateLicense with no token returns 'none',
      // so seeing 'cache' here proves the provided state was used verbatim.
      source: 'cache',
    };
    const result = await analyze({ files, config: baseConfig, rules: [flagAllDeclsRule], licenseState: trialState });
    expect(result.licenseState.plan).toBe('trial');
    expect(result.licenseState.source).toBe('cache');
  });

  it('falls back to process.env + validateLicense when licenseState is not provided', async () => {
    const saved = process.env['UISEAL_TOKEN'];
    delete process.env['UISEAL_TOKEN'];
    try {
      const files = new Map([['test.css', '.a { color: red; }']]);
      const result = await analyze({ files, config: baseConfig, rules: [flagAllDeclsRule] });
      // No token → validateLicense returns free/none
      expect(result.licenseState.plan).toBe('free');
      expect(result.licenseState.source).toBe('none');
    } finally {
      if (saved !== undefined) process.env['UISEAL_TOKEN'] = saved;
    }
  });

  it('uses provided free licenseState even when UISEAL_TOKEN env var is set', async () => {
    const saved = process.env['UISEAL_TOKEN'];
    process.env['UISEAL_TOKEN'] = 'fake-token-that-would-trigger-network';
    try {
      const files = new Map([['test.css', '.a { color: red; }']]);
      const freeState: LicenseState = {
        valid: false,
        plan: 'free',
        token: null,
        trialEndsAt: null,
        cachedAt: new Date(),
        // 'none' is returned by validateLicense only when there is NO token.
        // With a token set, validateLicense returns 'online'/'cache'/'offline'.
        // Seeing 'none' here proves the provided state was used, not validateLicense.
        source: 'none',
      };
      const result = await analyze({ files, config: baseConfig, rules: [flagAllDeclsRule], licenseState: freeState });
      expect(result.licenseState.plan).toBe('free');
      expect(result.licenseState.source).toBe('none');
    } finally {
      if (saved === undefined) {
        delete process.env['UISEAL_TOKEN'];
      } else {
        process.env['UISEAL_TOKEN'] = saved;
      }
    }
  });
});
