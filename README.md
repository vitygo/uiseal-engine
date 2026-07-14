# uiseal

Deterministic design-system linter for human and AI-generated code.

## What it is

uiseal is an AST-based static analysis tool that catches design token violations before they ship. It parses CSS, SCSS, LESS, TSX, and JSX files and enforces your design system's rules — hardcoded colors, arbitrary spacing, unauthorized fonts — the same way ESLint enforces code style. Integrates with the CLI, VSCode, and GitHub Actions.

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

## Architecture

Two seams keep `@uiseal/core` from growing copy-pasted dispatch logic as it adds file types and value kinds:

- **File-type dispatch** (`packages/core/src/parsers/registry.ts`): every parser (CSS, SCSS, LESS, JSX, …) is a `ParserEntry` registered once, with its own extensions and a `parse()` function. `getParserForFile()`, `supportedExtensions()`, and `buildGlob()` all derive from this registry — nothing else in the codebase (runner, extractor, cli, github-action) hardcodes an extension list or a `**/*.{tsx,jsx,css}`-style glob. SCSS and LESS reuse the CSS rule set entirely: `postcss-scss`/`postcss-less` produce the same `{ kind: 'css', root }` shape as plain CSS, so a CSS-dialect only needs a new `ParserEntry` here, not new rules. (Indented Sass — `.sass` — isn't registered; `postcss-scss` only parses the brace/semicolon SCSS syntax.) To support a new file type, add a `ParserEntry` and, if it's not CSS-shaped, a `ParsedFile` variant; don't add `ext === '...'` checks elsewhere.
- **Canonical design values** (`packages/core/src/values/parse-value.ts`): `parseValue(raw, propertyHint?)` is the single place that knows how to read a hex/rgb/hsl color, a px/rem length, or a font-family literal, and whether a value is a token reference — `var(--…)`, a SCSS `$variable`, or a LESS `@variable`. Rules, the extractor, and analyzers call `parseValue()` instead of keeping their own regexes. To support a new value kind, extend `parseValue()`; don't add a new regex to a rule.

## Packages

| Package | Description |
|---------|-------------|
| [`@uiseal/core`](./packages/core) | The rule engine — AST parsing, rule evaluation, token resolution |
| [`@uiseal/cli`](./packages/cli) | CLI + TUI (`uiseal` command) |
| [`@uiseal/github-action`](./packages/github-action) | GitHub Actions integration (coming soon) |

## License

[Elastic License 2.0](./LICENSE) — free for internal use. You may not offer uiseal as a hosted or managed service to third parties.
