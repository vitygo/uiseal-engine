# uiseal

Deterministic design-system linter for human and AI-generated code.

## What it is

uiseal is an AST-based static analysis tool that catches design token violations before they ship. It parses CSS, TSX, and JSX files and enforces your design system's rules — hardcoded colors, arbitrary spacing, unauthorized fonts — the same way ESLint enforces code style. Integrates with the CLI, VSCode, and GitHub Actions.

## Install

```sh
npm install -g @uiseal/cli
```

## Usage

```sh
uiseal          # interactive TUI — browse results by file, category, rule
uiseal check    # CI-friendly CLI output with exit code
uiseal init     # generate uiseal.config.json
```

## Rules

| Rule | Category | Description |
|------|----------|-------------|
| `no-hardcoded-color` | color | Raw color values instead of design tokens |
| `no-arbitrary-font-size` | typography | Font sizes not from the type scale |
| `no-arbitrary-radius` | shape | Border-radius values outside the token set |
| `no-arbitrary-spacing` | spacing | Margin/padding not from the spacing scale |
| `no-magic-numbers` | tokens | Numeric literals that should be token references |
| `no-inline-styles` | style | Inline `style` props on JSX elements |
| `enforce-contrast` | accessibility | Color combinations that fail WCAG contrast ratios |
| `no-dead-token` | tokens | References to tokens that no longer exist |
| `no-unauthorized-font-family` | typography | Font families not in the approved list |
| `no-missing-form-label` | accessibility | Form inputs without an associated label |
| `no-autofocus` | accessibility | `autofocus` attribute that disrupts focus order |
| `no-div-button` | accessibility | `<div>` used as an interactive button |
| `variant-sprawl` | components | Component variants that fall outside the allowed set |

## TUI

Run `uiseal` without arguments to open the interactive terminal UI:

- Browse violations by file or category
- Drill into individual rules with counts and examples
- Toggle between new violations and all violations
- Open any violation directly in your editor
- Manage baselines to track regressions over time

## Config

```json
{
  "include": ["src/**/*.{tsx,jsx,css}"],
  "exclude": ["**/*.test.*", "node_modules"],
  "rules": {
    "no-hardcoded-color": "error",
    "no-arbitrary-font-size": "warn",
    "no-inline-styles": "off"
  },
  "tokens": "./tokens.json"
}
```

## Packages

| Package | Description |
|---------|-------------|
| [`@uiseal/core`](./packages/core) | The rule engine — AST parsing, rule evaluation, token resolution |
| [`@uiseal/cli`](./packages/cli) | CLI + TUI (`uiseal` command) |
| [`@uiseal/github-action`](./packages/github-action) | GitHub Actions integration (coming soon) |

## License

[Elastic License 2.0](./LICENSE) — free for internal use. You may not offer uiseal as a hosted or managed service to third parties.
