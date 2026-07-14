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
uiseal init     # generate uiseal.config.json — auto-detects Tailwind/CSS
                # variables and offers them as the token source, falling
                # back to scanning your code if neither is present
uiseal init --from tailwind  # explicitly generate from tailwind.config.*
uiseal init --from css-vars  # explicitly generate from a CSS/SCSS variables file
uiseal init --from code      # explicitly scan source code (today's behavior)
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

Three seams keep `@uiseal/core` from growing copy-pasted dispatch logic as it adds file types, value kinds, and token sources:

- **File-type dispatch** (`packages/core/src/parsers/registry.ts`): every parser (CSS, SCSS, LESS, JSX, …) is a `ParserEntry` registered once, with its own extensions and a `parse()` function. `getParserForFile()`, `supportedExtensions()`, and `buildGlob()` all derive from this registry — nothing else in the codebase (runner, extractor, cli, github-action) hardcodes an extension list or a `**/*.{tsx,jsx,css}`-style glob. SCSS and LESS reuse the CSS rule set entirely: `postcss-scss`/`postcss-less` produce the same `{ kind: 'css', root }` shape as plain CSS, so a CSS-dialect only needs a new `ParserEntry` here, not new rules. (Indented Sass — `.sass` — isn't registered; `postcss-scss` only parses the brace/semicolon SCSS syntax.) To support a new file type, add a `ParserEntry` and, if it's not CSS-shaped, a `ParsedFile` variant; don't add `ext === '...'` checks elsewhere.
- **Canonical design values** (`packages/core/src/values/parse-value.ts`): `parseValue(raw, propertyHint?)` is the single place that knows how to read a hex/rgb/hsl color, a px/rem length, or a font-family literal, and whether a value is a token reference — `var(--…)`, a SCSS `$variable`, or a LESS `@variable`. Rules, the extractor, and analyzers call `parseValue()` instead of keeping their own regexes. To support a new value kind, extend `parseValue()`; don't add a new regex to a rule.
- **Token sources** (`packages/core/src/sources/registry.ts`) — see below.

## Token sources

`uiseal init` doesn't have to guess your design tokens by scanning code for repeated values — it can read them straight from wherever your project already defines them. A **token source** is `{ id, label, detect(cwd), extract(cwd) }`: `detect()` reports whether the source exists in this project (with a confidence, for ranking when more than one is found), `extract()` reads it into a flat `SourceTokens` shape ready to drop into `uiseal.config.json`.

| Source | id | Confidence | Reads |
|--------|----|-----------|-------|
| Tailwind CSS config | `tailwind` | 0.9 | `tailwind.config.{js,cjs,mjs,ts}` — `theme`/`theme.extend`, flattening nested color scales and converting rem/em to px |
| CSS variables | `css-vars` | 0.8 | The most-populated `:root { --* }` (CSS) or top-level `$var` (SCSS) file among common names/locations (`variables.css`, `tokens.css`, `theme.css`, …, in the project root, `src/`, `src/styles/`, `styles/`, …) |
| Scan existing code | `code-scan` | 0.1 | Repeated values across your `.css`/`.scss`/`.less`/`.tsx`/`.jsx` files — the original `init` behavior, kept as the fallback when nothing more authoritative is detected |

`uiseal init` runs every registered source's `detect()` and uses the highest-confidence match automatically; if more than one real source is found, it asks which one is the source of truth. Pass `--from <tailwind|css-vars|code>` to skip detection and pick one explicitly.

Adding a new source (e.g. Style Dictionary) is a one-file task: implement `TokenSource` in a new file under `packages/core/src/sources/`, then add it to the array in `sources/registry.ts`. `TokenSource`, `SourceTokens`, `DetectResult`, and `detectSources()`/`getAllSources()`/`getSourceById()` are all exported from `@uiseal/core`.

## Packages

| Package | Description |
|---------|-------------|
| [`@uiseal/core`](./packages/core) | The rule engine — AST parsing, rule evaluation, token resolution |
| [`@uiseal/cli`](./packages/cli) | CLI + TUI (`uiseal` command) |
| [`@uiseal/github-action`](./packages/github-action) | GitHub Actions integration (coming soon) |

## License

[Elastic License 2.0](./LICENSE) — free for internal use. You may not offer uiseal as a hosted or managed service to third parties.
