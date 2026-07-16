import path from 'node:path';
import type { Violation } from '../types.js';
import type { RuleMetadata, Severity } from '../rules/types.js';
import { allRules } from '../rules/index.js';
import { postAnalyzerMetadata } from '../analyzers/post-analyzer-metadata.js';

// All 22 Rule objects plus the 3 post-analyzers (no-dead-token,
// spacing-near-token, variant-sprawl) that report violations but aren't
// Rule objects in allRules. Every ruleId a Violation can carry has an entry
// here, so every SARIF result's ruleId resolves to a tool.driver.rules entry.
const allRuleMetadata: RuleMetadata[] = [...allRules, ...postAnalyzerMetadata];

export interface FormatSarifOptions {
  /** Repo root; violation file paths are made relative to this for SARIF's artifactLocation.uri. */
  cwd: string;
  /** uiseal version, used as tool.driver.version. */
  version: string;
}

function toPascalCase(id: string): string {
  return id
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function severityToLevel(severity: Severity): 'error' | 'warning' {
  return severity === 'error' ? 'error' : 'warning';
}

// GitHub's SARIF ingestion requires artifactLocation.uri to be relative to
// the repo root, forward-slashed, and without a leading "./".
function toRelativeUri(cwd: string, filePath: string): string {
  const rel = path.isAbsolute(filePath) ? path.relative(cwd, filePath) : filePath;
  return rel.split(path.sep).join('/').replace(/^\.\//, '');
}

function buildRuleDescriptor(rule: RuleMetadata) {
  return {
    id: rule.id,
    name: toPascalCase(rule.id),
    shortDescription: { text: rule.shortDescription ?? rule.id },
    fullDescription: { text: rule.fullDescription ?? rule.shortDescription ?? rule.id },
    helpUri: rule.helpUri ?? `https://uiseal.io/docs/rules/${rule.id}`,
    defaultConfiguration: { level: severityToLevel(rule.defaultSeverity) },
    properties: { tags: [rule.category, 'uiseal'], category: rule.category },
  };
}

// tool.driver.rules lists every known rule, not just the ones with hits in
// this run. GitHub uses tool.driver.rules to populate the Security tab's
// rule catalog (enable/disable, browse descriptions), so a rule with zero
// violations today would otherwise never show up there at all.
export function formatSarif(violations: Violation[], options: FormatSarifOptions): string {
  const { cwd, version } = options;

  const rules = allRuleMetadata.map(buildRuleDescriptor);
  const ruleIndexById = new Map(allRuleMetadata.map((rule, index) => [rule.id, index]));

  const results = violations.map((violation) => {
    const ruleIndex = ruleIndexById.get(violation.ruleId);
    const uri = toRelativeUri(cwd, violation.file);

    // Our violation positions point at the declaration/property start, not
    // the exact value offset (see fixer/apply-fixes.ts), so we can't emit a
    // precise SARIF fix region. GitHub's SARIF fix support is display-only
    // anyway (it never applies fixes automatically), so we omit `fixes` for
    // v1 and fold the suggested value into the message text instead, where
    // users will actually see it in the Security tab.
    const messageText = violation.fix?.suggested
      ? `${violation.message} Suggested fix: ${violation.fix.suggested}`
      : violation.message;

    return {
      ruleId: violation.ruleId,
      ...(ruleIndex !== undefined ? { ruleIndex } : {}),
      level: severityToLevel(violation.severity),
      message: { text: messageText },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri, uriBaseId: '%SRCROOT%' },
            region: { startLine: violation.line, startColumn: violation.column },
          },
        },
      ],
    };
  });

  const sarif = {
    version: '2.1.0',
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    runs: [
      {
        tool: {
          driver: {
            name: 'uiseal',
            version,
            informationUri: 'https://uiseal.io',
            rules,
          },
        },
        results,
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}
