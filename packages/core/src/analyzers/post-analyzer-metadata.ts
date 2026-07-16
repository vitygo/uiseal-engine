import type { RuleMetadata } from '../rules/types.js';

// no-dead-token, spacing-near-token, and variant-sprawl are standalone
// post-analyzer functions, not Rule objects in allRules — but their ruleId
// still needs a catalog entry for SARIF's tool.driver.rules. This is the
// only place their metadata lives; keep it in sync with the ruleId strings
// used in analyzers/no-dead-token.ts, analyzers/spacing-near-token.ts, and
// analyzers/variant-sprawl.ts.
export const postAnalyzerMetadata: RuleMetadata[] = [
  {
    id: 'no-dead-token',
    category: 'quality',
    defaultSeverity: 'warning',
    shortDescription: 'Flag design tokens that are defined but never used',
    fullDescription:
      'Flags a CSS custom property defined in the token source that is never referenced via var(--token) anywhere in the scanned files. A growing set of unused tokens is a sign the design system and the codebase have drifted apart.',
    helpUri: 'https://uiseal.io/docs/rules/no-dead-token',
  },
  {
    id: 'spacing-near-token',
    category: 'design',
    defaultSeverity: 'warning',
    shortDescription: 'Suggest the nearest spacing token for near-miss values',
    fullDescription:
      'A companion to no-arbitrary-spacing: when an off-scale spacing value is close enough to a real token to likely be an off-by-a-few-pixels mistake, this reports it with a "did you mean" suggestion.',
    helpUri: 'https://uiseal.io/docs/rules/spacing-near-token',
  },
  {
    id: 'variant-sprawl',
    category: 'quality',
    defaultSeverity: 'warning',
    shortDescription: 'Flag near-duplicate component variants that should be consolidated',
    fullDescription:
      'Compares component structures across the codebase and flags pairs that are nearly identical except for a few prop or class differences, a sign of copy-paste variant sprawl instead of a single parameterized component.',
    helpUri: 'https://uiseal.io/docs/rules/variant-sprawl',
  },
];
