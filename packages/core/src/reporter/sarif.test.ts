import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import { formatSarif } from './sarif.js';
import sarifSchema from './schemas/sarif-2.1.0-schema.json';
import type { Violation } from '../types.js';

const CWD = '/repo';

function violation(overrides: Partial<Violation> = {}): Violation {
  return {
    ruleId: 'no-hardcoded-color',
    severity: 'error',
    message: 'Hardcoded color "#fff" in "color". Replace with a design token.',
    file: '/repo/src/Button.tsx',
    line: 4,
    column: 10,
    ...overrides,
  };
}

function parse(output: string): any {
  return JSON.parse(output);
}

describe('formatSarif', () => {
  it('produces valid, parseable JSON', () => {
    const output = formatSarif([violation()], { cwd: CWD, version: '1.2.3' });
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('sets the top-level version and $schema', () => {
    const doc = parse(formatSarif([], { cwd: CWD, version: '1.2.3' }));
    expect(doc.version).toBe('2.1.0');
    expect(doc.$schema).toContain('sarif-schema-2.1.0.json');
  });

  it('sets tool.driver fields from the given version', () => {
    const doc = parse(formatSarif([], { cwd: CWD, version: '9.9.9' }));
    const driver = doc.runs[0].tool.driver;
    expect(driver.name).toBe('uiseal');
    expect(driver.version).toBe('9.9.9');
    expect(driver.informationUri).toBe('https://uiseal.io');
  });

  it('lists ALL known rules in tool.driver.rules, not just ones with hits', () => {
    const doc = parse(formatSarif([violation()], { cwd: CWD, version: '1.0.0' }));
    const rules = doc.runs[0].tool.driver.rules;
    // 22 Rule objects + 3 post-analyzers (no-dead-token, spacing-near-token, variant-sprawl).
    expect(rules.length).toBe(25);
    const ids = rules.map((r: any) => r.id);
    expect(ids).toContain('no-hardcoded-color');
    expect(ids).toContain('no-dead-token');
    expect(ids).toContain('spacing-near-token');
    expect(ids).toContain('variant-sprawl');
  });

  it('gives every rule a PascalCase name, shortDescription, fullDescription, helpUri, and tags', () => {
    const doc = parse(formatSarif([], { cwd: CWD, version: '1.0.0' }));
    const rule = doc.runs[0].tool.driver.rules.find((r: any) => r.id === 'no-hardcoded-color');
    expect(rule.name).toBe('NoHardcodedColor');
    expect(typeof rule.shortDescription.text).toBe('string');
    expect(rule.shortDescription.text.length).toBeGreaterThan(0);
    expect(typeof rule.fullDescription.text).toBe('string');
    expect(rule.helpUri).toBe('https://uiseal.io/docs/rules/no-hardcoded-color');
    expect(rule.defaultConfiguration.level).toBe('error');
    expect(rule.properties.tags).toEqual(['design', 'uiseal']);
    expect(rule.properties.category).toBe('design');
  });

  it("every result's ruleId exists in tool.driver.rules, and ruleIndex points at the right entry", () => {
    const doc = parse(
      formatSarif(
        [violation({ ruleId: 'no-hardcoded-color' }), violation({ ruleId: 'no-autofocus', severity: 'warning' })],
        { cwd: CWD, version: '1.0.0' },
      ),
    );
    const rules = doc.runs[0].tool.driver.rules;
    for (const result of doc.runs[0].results) {
      expect(rules[result.ruleIndex].id).toBe(result.ruleId);
    }
  });

  it('maps severity to SARIF level (error -> error, warning -> warning)', () => {
    const doc = parse(
      formatSarif([violation({ severity: 'error' }), violation({ severity: 'warning' })], {
        cwd: CWD,
        version: '1.0.0',
      }),
    );
    expect(doc.runs[0].results[0].level).toBe('error');
    expect(doc.runs[0].results[1].level).toBe('warning');
  });

  it('makes URIs relative to cwd, forward-slashed, with no leading ./, plus uriBaseId', () => {
    const doc = parse(
      formatSarif([violation({ file: '/repo/src/nested/Button.tsx' })], { cwd: '/repo', version: '1.0.0' }),
    );
    const loc = doc.runs[0].results[0].locations[0].physicalLocation;
    expect(loc.artifactLocation.uri).toBe('src/nested/Button.tsx');
    expect(loc.artifactLocation.uri.startsWith('./')).toBe(false);
    expect(loc.artifactLocation.uri).not.toContain('\\');
    expect(loc.artifactLocation.uriBaseId).toBe('%SRCROOT%');
    expect(loc.region.startLine).toBe(4);
    expect(loc.region.startColumn).toBe(10);
  });

  it('produces a valid empty-results SARIF document for no violations', () => {
    const doc = parse(formatSarif([], { cwd: CWD, version: '1.0.0' }));
    expect(doc.runs[0].results).toEqual([]);
    expect(doc.runs[0].tool.driver.rules.length).toBe(25);
  });

  it('produces a separate result per violation, even for the same file', () => {
    const doc = parse(
      formatSarif(
        [violation({ line: 1 }), violation({ line: 2 }), violation({ line: 3 })],
        { cwd: CWD, version: '1.0.0' },
      ),
    );
    expect(doc.runs[0].results).toHaveLength(3);
    expect(doc.runs[0].results.map((r: any) => r.locations[0].physicalLocation.region.startLine)).toEqual([1, 2, 3]);
  });

  it('tags each rule with its own category (one violation per category)', () => {
    const doc = parse(
      formatSarif(
        [
          violation({ ruleId: 'no-hardcoded-color' }), // design
          violation({ ruleId: 'no-img-without-alt' }), // a11y
          violation({ ruleId: 'no-xss-dangerous' }), // security
          violation({ ruleId: 'no-console-log' }), // quality
        ],
        { cwd: CWD, version: '1.0.0' },
      ),
    );
    const rules = doc.runs[0].tool.driver.rules;
    const byId = (id: string) => rules.find((r: any) => r.id === id);
    expect(byId('no-hardcoded-color').properties.category).toBe('design');
    expect(byId('no-img-without-alt').properties.category).toBe('a11y');
    expect(byId('no-xss-dangerous').properties.category).toBe('security');
    expect(byId('no-console-log').properties.category).toBe('quality');
  });

  it('omits SARIF `fixes` (display-only in GitHub) and instead folds the suggested value into the message text', () => {
    const doc = parse(
      formatSarif(
        [violation({ fix: { suggested: 'var(--color-primary)' } })],
        { cwd: CWD, version: '1.0.0' },
      ),
    );
    const result = doc.runs[0].results[0];
    expect(result.fixes).toBeUndefined();
    expect(result.message.text).toContain('var(--color-primary)');
  });

  describe('SARIF 2.1.0 schema validation', () => {
    // logger: false — the schema uses format keywords (uri, date-time) we don't
    // validate (no ajv-formats), which would otherwise spam console.warn per compile.
    const ajv = new Ajv({ strict: false, allErrors: true, logger: false });
    const validate = ajv.compile(sarifSchema as object);

    it('validates a document with several violations against the official schema', () => {
      const doc = parse(
        formatSarif(
          [
            violation({ ruleId: 'no-hardcoded-color', severity: 'error' }),
            violation({ ruleId: 'no-autofocus', severity: 'warning', fix: undefined }),
            violation({ ruleId: 'no-dead-token', severity: 'warning', fix: undefined }),
          ],
          { cwd: CWD, version: '1.0.0' },
        ),
      );
      const valid = validate(doc);
      expect(validate.errors ?? null).toBeNull();
      expect(valid).toBe(true);
    });

    it('validates the empty-results document against the official schema', () => {
      const doc = parse(formatSarif([], { cwd: CWD, version: '1.0.0' }));
      const valid = validate(doc);
      expect(validate.errors ?? null).toBeNull();
      expect(valid).toBe(true);
    });
  });
});
