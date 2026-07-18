# uiseal

Deterministic design-system linter for human and AI-generated code.

## What it is

uiseal is an AST-based static analysis tool that catches design token violations before they ship. It parses CSS, SCSS, LESS, TSX, JSX, Vue (.vue), Angular (.component.ts), Svelte (.svelte), and backend templates — Blade, Jinja2, ERB, Twig — and enforces your design system's rules — hardcoded colors, arbitrary spacing, unauthorized fonts — the same way ESLint enforces code style. Integrates with the CLI, VSCode, and GitHub Actions.

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
uiseal drift    # compare the LIVE token source against the LIVE code — see below
uiseal watch    # live incremental re-scan as files change — see below
```

## Watch mode

`uiseal watch` re-scans incrementally: it does one full initial scan, then re-analyzes only the file(s) that actually changed on every save, instead of re-scanning the whole project. On a project with hundreds of files, that's the difference between an update landing in well under 100ms and a multi-second full rescan on every keystroke-adjacent save — which matters most when an AI tool is generating or editing code and files are changing every few seconds.

```sh
uiseal watch                       # watch the current directory
uiseal watch src                   # watch a specific directory
uiseal watch --debounce 500        # wait 500ms of quiet before re-scanning (default 300ms)
uiseal watch --no-clear            # don't clear the terminal between updates
```

Recommended workflow: keep `uiseal watch` running in a terminal alongside Cursor, Claude Code, or any other AI coding tool. Violations show up within a few hundred milliseconds of the AI writing a file — hardcoded colors, missing alt text, arbitrary Tailwind values — instead of surfacing only at the next `uiseal check` or CI run, well after the AI (or you) have moved on to something else.

Each update shows a small header with the running totals plus which file just changed, then the same violation list `uiseal check` prints:

```
┌────────────────────────────────────────────────────────┐
│  uiseal watch                                          │
│  3 violations (2 errors, 1 warnings) in 1 file          │
│  Last update: src/App.tsx (3 violations)                │
└────────────────────────────────────────────────────────┘

  src/App.tsx
    2:16
      error  Hardcoded color "#1a73e8" in "color". Did you mean var(primary)?  [no-hardcoded-color]
      fix: var(primary)
    ...

✖  2 errors, 1 warning in 1 file

Watching 247 files... press q to quit
```

Press `q` or `Ctrl-C` to stop; it prints a final summary and exits with the same code `uiseal check` would (`1` if any error-severity violations remain, `0` otherwise). It also appears as an entry in the interactive TUI (`uiseal` with no arguments).

**How incremental scanning works:** the 3 cross-file checks (`no-dead-token`, `spacing-near-token`, `variant-sprawl`) can't be computed from a single changed file in isolation, since they compare data across the whole project — those still re-run on every update, but over already-extracted per-file data rather than by re-parsing every file, so they stay fast even on a large project.

## Output formats

`uiseal check` supports three output formats via `--format`:

```sh
uiseal check                              # pretty: ANSI-colored terminal report (default)
uiseal check --format json                # machine-readable JSON for scripting
uiseal check --format sarif                # SARIF 2.1.0 for GitHub's Security tab
uiseal check --format sarif --output results.sarif  # write straight to a file
```

`--output <file>` writes whichever format you chose directly to a file instead of stdout — this avoids shell-redirection footguns (`>` truncating before a crashed process flushes its buffer, `2>&1` mixing stderr diagnostics into the file, etc.) and is the recommended way to produce a SARIF file for upload. Exit codes are identical across all three formats: `0` if no error-severity violations were found, `1` otherwise.

For `json`/`sarif`, **stdout carries only the payload** — no banners, no progress lines, no ANSI color codes. Scan counts, baseline status, and other diagnostic text are written to stderr instead, so `uiseal check --format sarif > results.sarif` and `uiseal check --format json | jq ...` always see clean, parseable output on stdout.

### JSON format

```sh
uiseal check --format json | jq '.summary.errors'
```

```jsonc
{
  "violations": [
    { "ruleId": "no-hardcoded-color", "severity": "error", "message": "...", "file": "src/Button.tsx", "line": 4, "column": 10, "fix": { "suggested": "var(--color-primary)" } }
  ],
  "summary": { "total": 1, "errors": 1, "warnings": 0, "fixable": 1, "filesScanned": 12 }
}
```

### SARIF format and the GitHub Security tab

[SARIF](https://sarifweb.azurewebsites.net/) (Static Analysis Results Interchange Format) is the standard GitHub uses to power the Security tab: inline PR annotations, a browsable rule catalog, and drift tracking across commits. `uiseal check --format sarif` generates a SARIF 2.1.0 document with a `tool.driver.rules` catalog listing **all** uiseal rules (so the Security tab shows the full ruleset, not just whatever happened to fire on this run) and one `result` per violation, with repo-root-relative, forward-slash file URIs as GitHub's ingestion requires.

This action doesn't upload SARIF itself — pair it with `github/codeql-action/upload-sarif`:

```yaml
- uses: actions/checkout@v4
- uses: your-org/uiseal-action@v1
  with:
    sarif-file: uiseal.sarif
- uses: github/codeql-action/upload-sarif@v3
  if: always()
  with:
    sarif_file: uiseal.sarif
```

Or from the CLI directly in any CI system:

```sh
uiseal check --format sarif --output uiseal.sarif
```

**Known limitation:** SARIF's `fixes` field (a machine-applicable patch GitHub can display) is omitted for now — uiseal's violation positions point at the start of the declaration/property, not the exact value offset, so a precise fix *region* isn't available the way `--fix` computes it internally. GitHub's SARIF fix support is display-only anyway (it never applies a fix automatically), so the suggested replacement value is folded into the result's message text instead, where it's actually visible in the Security tab.

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
| `no-tailwind-arbitrary` | design | Tailwind arbitrary-value classes (`px-[13px]`) off the token scale — see [Tailwind support](#tailwind-support) |

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

## Drift detection

`uiseal check` compares your code against `uiseal.config.json` — a **snapshot** taken whenever `init` last ran. Over months of work (especially with AI-generated code), two things happen that `check` alone can't see: your actual token source moves on (a designer adds colors to `tailwind.config.js`) without anyone re-running `init`, and the codebase quietly accumulates off-token values that never got flagged because nobody happened to touch that file when a rule existed to catch it.

`uiseal drift` re-reads the **live** token source right now — not the config snapshot — and compares it against the **live** code right now:

```sh
uiseal drift                        # auto-detect the source, print a report
uiseal drift --source tailwind      # compare against tailwind.config.js directly
uiseal drift --json                 # structured output for CI/scripting
uiseal drift --verbose               # show every drifted value, not just the top ones
```

Example output:

```
╭─────────────────────────────────────────╮
│  DESIGN SYSTEM DRIFT REPORT            │
│  Source: CSS variables (variables.css) │
│  Scanned: 3 files, 7 values extracted  │
╰─────────────────────────────────────────╯

DRIFT: 60.0%  (3 off-token values / 5 unique values)

┌─────────────┬────────┬─────────┬───────────┬────────┐
│ Category    │ Tokens │ In Code │ Drifted   │ Unused │
├─────────────┼────────┼─────────┼───────────┼────────┤
│ Colors      │      3 │      2  │     1 ●●● │      2 │
│ Spacing     │      3 │      2  │     1 ●●● │      2 │
...

TOP DRIFTED VALUES (most occurrences first):
  #1a73e8  (not in tokens)   2 occurrences in 1 file
    → nearest: color-primary (#3b82f6)
  13px  (not in spacing)   2 occurrences in 1 file
    → nearest: 16px  Δ3px

UNUSED TOKENS (defined in source, never used in code):
  colors: color-danger, color-warning
  spacing: 8px, 24px
```

`drift` catches two distinct things: **drifted values** (in code, not in the live source — an off-token color or spacing value, possibly with a nearest-token suggestion if it's close) and **unused tokens** (defined in the live source, never referenced anywhere in the code — a sign the design system and the codebase have grown apart). The headline percentage — `driftedValues / uniqueValuesInCode` — is the number worth tracking over time.

**CI usage:** `uiseal drift --json` exits `1` when drift is at or above 10% (hardcoded for now), so it's usable as a gate on its own; the JSON adds a flattened, category-tagged `driftedValues` array specifically for scripting:

```sh
uiseal drift --json | jq '.summary.driftPercentage'
```

**Known limitation:** drift's code-value collection covers CSS declarations and inline styles (real `.css`/`.scss`/`.less` files, and JSX/Vue/Angular/Svelte inline `style`/`style:`/`:style`/`[ngStyle]` bindings) — Tailwind utility classes aren't scanned for drift purposes (matching the scope of the underlying code extractor). A codebase that's 100% Tailwind classes with no inline styles or stylesheets will show 0 unique values in code, not an error.

## Tailwind support

A Tailwind class like `px-4` or `text-blue-500` is a *reference* to whatever's in your Tailwind config — it's valid by definition, not something uiseal can second-guess without re-implementing Tailwind's own theme resolution. What uiseal checks instead is Tailwind's arbitrary-value escape hatch: `px-[13px]`, `text-[#ff5733]`, `rounded-[7px]`, `[padding:13px]` — literal values written inline, bypassing the design system entirely. That's the pattern this catches, and it's a common "AI smell": a generated component that's 95% standard utilities with one arbitrary value slipped in.

**What's checked:** arbitrary-value classes in `className`/`class` — spacing (`p*`/`m*`/`gap`/`inset`/`w`/`h`/...), color (any prefix whose bracket value parses as a color), font-size (`text-[15px]`), and radius (`rounded-[...]`) — flagged when the value isn't an exact match in your `uiseal.config.json` token scale. A value that happens to exactly match a token (`bg-[#3b82f6]` when `#3b82f6` is configured) is skipped: it's correct, just unnecessarily verbose, and that's a style call, not a token violation.

**What's NOT checked:** every standard utility class, ever — `px-4`, `text-blue-500`, `mt-2`, `rounded-lg` are never flagged, regardless of your config. Also `other`-category arbitrary values (`leading-[1.2]`, `grid-cols-[1fr_500px]`, ...) — nothing to check them against yet — and dynamic values (`w-[calc(100%-20px)]`, `text-[var(--x)]`), which aren't literal.

**Usage:**
```sh
uiseal init --from tailwind   # generate uiseal.config.json from tailwind.config.*
uiseal check                  # no-tailwind-arbitrary runs alongside every other rule
uiseal check --fix            # px-[13px] -> px-[12px] when a close token exists
```

**Known limitations:**
- Only what's statically analyzable in `className` is read: a plain string, a template literal's static parts (`` `px-4 ${dynamic}` `` — the `${dynamic}` part is skipped, not evaluated), string-literal arguments to any call expression (covers `cn()`/`clsx()`/`classnames()` without hardcoding those names — `cn('px-4', condition && 'mt-2')` skips the conditional argument), and `+` string concatenation. A bare variable (`className={classes}`) or anything else dynamic is skipped entirely — no false positives, but no coverage either.
- Fix suggestions substitute the nearest on-token *raw value* back into the same bracket syntax (`px-[13px]` → `px-[12px]`) rather than resolving to the Tailwind utility name that value would correspond to (`px-3`) — the reverse mapping needs your Tailwind config loaded at check-time, not just at init-time. Noted as a future improvement.

## Vue support

A `.vue` Single File Component has two analyzable parts, both checked: the `<style>` block(s) (including `<style lang="scss">` / `<style lang="less">` — nesting, `$variables`, everything the same CSS rules already handle in a standalone `.scss`/`.less` file) and the `<template>` block, for inline `:style`/`style=` values and `class`/`:class` Tailwind arbitrary values (same rules, same [Tailwind support](#tailwind-support) above — a `.vue` template isn't a second, different Tailwind checker).

**What's checked:**
- Every `<style>` block, parsed with the right CSS dialect for its `lang` attribute, run through the exact same rules as a real `.css`/`.scss`/`.less` file — hardcoded colors, arbitrary spacing/font-size/radius, everything.
- `:style="{ padding: '13px', color: '#fff' }"` object bindings and static `style="padding: 13px"` attributes in `<template>` — converted to the same synthetic declarations the JSX `style={{}}` adapter already produces, so the same CSS rules run on them.
- `class="px-4 mt-[13px]"`, `:class="'...'"`, `:class="{ 'mt-[13px]': isActive }"` (object keys are class names, checked regardless of the condition's value — this is static analysis, not runtime evaluation), and `:class="[...]"` arrays (including both branches of a ternary) — same arbitrary-value detection as JSX `className`.

**What's NOT checked:** anything inside `<script>`/`<script setup>` — component logic isn't analyzed for style-related values. Dynamic bindings (`:style="computedStyle"`, `:class="dynamicClasses"`) are skipped — only literal object/array/string forms are statically parseable.

**Usage:** no separate flag or setup — `.vue` is in the glob `uiseal check`/`uiseal init` already scan; `--fix` rewrites both `<style>` CSS values and `<template>` Tailwind classes in the same pass.

## Angular support

An Angular component's styles and template can each be either **inline** (in the `@Component({...})` decorator) or **external** (`styleUrls`/`templateUrl`, pointing at separate files) — uiseal checks both forms the same way. Only `*.component.ts` is scanned as an Angular component (the standard Angular CLI naming convention) — a plain `.ts` file is never parsed at all, so this adds zero scan cost to the rest of a TypeScript codebase.

**What's checked:**
- Inline `styles: [\`...\`]` entries in the decorator — each parsed as CSS and run through the exact same rules as a real `.css` file.
- External `.component.scss`/`.component.css`/`.component.less` — already covered by uiseal's existing CSS/SCSS/LESS support; Angular doesn't need to do anything extra for these, they're picked up like any other stylesheet.
- An external `.component.html` template, or an inline `template: \`...\`` string — both analyzed for:
  - Static `class="px-4 mt-[13px]"` and `style="padding: 13px"` attributes.
  - `[ngStyle]="{ 'color': '#f00' }"` object bindings (same handling as Vue's `:style`).
  - `[style.padding.px]="13"` individual property bindings — the property name and unit come from the binding name itself, the value from the bound expression (a bare number, or a quoted string for something like a color).
  - `[ngClass]="{ 'mt-[13px]': isActive }"` and `[class]="'...'"` — same Tailwind arbitrary-value detection as everywhere else, object keys checked regardless of the condition's value.

**What's NOT checked:** component class logic (`.ts` code outside the decorator's `styles`/`template`), and any binding that isn't a literal object/array/string/number — `[ngStyle]="computedStyles()"` or `[style.z-index]="5"` (no unit, ambiguous) are skipped rather than guessed at.

**Usage:** no separate flag or setup — `*.component.ts` and `*.component.html` are in the glob `uiseal check`/`uiseal init` already scan; `--fix` rewrites inline `<style>`-equivalent CSS values and template Tailwind classes in the same pass.

## Svelte support

A `.svelte` file's `<style>` block (including `lang="scss"`/`lang="less"`) and markup are both checked, the same way as Vue/Angular — parsed with the real Svelte compiler (`svelte/compiler`), which gives every attribute and directive its own precise, already-absolute position in the file.

**What's checked:**
- The `<style>` block — parsed with the right CSS dialect for its `lang` attribute, run through the exact same rules as a real `.css`/`.scss`/`.less` file.
- Static `class="px-4 mt-[13px]"` and `style="padding: 13px"` attributes — same as everywhere else.
- `style:color="#f00"` / `style:padding="13px"` directives (Svelte's per-property style binding) — the CSS property comes from the directive name, the value from its (static) content; `style:color="var(--primary)"` correctly resolves as a token reference, no violation.
- `class:mt-[13px]={condition}` directives — the class name is the directive name itself (Svelte parses bracket syntax in a directive name without issue), checked for Tailwind arbitrary values regardless of the bound condition. A directive like `class:active={isActive}` naturally never flags anything, since "active" isn't arbitrary-value syntax.
- Markup inside `{#if}`/`{#each}` blocks — Svelte's AST holds these as ordinary nested structure, so they're scanned along with everything else, no special-casing needed.

**What's NOT checked:** `<script>` content, and any dynamic binding (`style:color={expr}`, `style={expr}`, `class={expr}`) — only literal string values are statically known.

**Usage:** no separate flag or setup — `.svelte` is in the glob `uiseal check`/`uiseal init` already scan; `--fix` rewrites both `<style>` CSS values and template Tailwind classes/directives in the same pass.

## Backend template support

Laravel Blade, Jinja2, Rails ERB, and Twig — all four dialects are HTML with embedded template syntax (`{{ }}`, `{% %}`, `<% %>`, `@directive`), checked by one shared parser: a regex-based tag/attribute scan (the same proven approach as Angular's external `.component.html` templates), not a real template-engine parser.

| Extension | Engine | Ecosystem |
|-----------|--------|-----------|
| `.blade.php` | Blade | Laravel (PHP) |
| `.j2`, `.jinja2` | Jinja2 | Flask/Django (Python) |
| `.erb`, `.html.erb` | ERB | Rails (Ruby) |
| `.twig`, `.html.twig` | Twig | Symfony (PHP) |

**How template tags are handled:** every non-newline character inside a matched template tag ( `{{ $var }}`, `{% if %}`, `<%= expr %>`, `@if(...)`, ...) is replaced with a single space before the file is scanned — not parsed, not evaluated, just neutralized. This keeps every position in the file exactly where it was (same length, same newlines), so:
- a template expression embedded in `class="px-4 {{ $dynamic }} mt-[13px]"` collapses to whitespace, which splits cleanly around it — `mt-[13px]` still gets checked, `$dynamic` never does;
- a template expression embedded in a `style="color: {{ $color }}"` value produces a CSS value uiseal can't classify, so it's silently skipped, never a false positive;
- violation line numbers always match the real, un-neutralized file — including when the violation sits inside a stripped `@if`/`{% if %}`/`<% if %>` block.

**What's checked:** static `class="..."` and `style="..."` attributes — Tailwind arbitrary values and CSS declarations, same detection as every other supported file type. **What's NOT checked:** template-engine logic itself (`@foreach`, `{% for %}`, Ruby/PHP/Python code inside `<% %>`/`{{ }}`) — only the literal, static portions of attribute values.

**Known limitation:** bare `.html` is intentionally **not** registered — it's ambiguous (could be a Jinja2 template, or just static/build-output HTML you don't want scanned). Rename Jinja2 templates to `.j2`/`.jinja2`, or use one of the other three engines' conventional extensions, which are unambiguous.

**Usage:** no separate flag or setup — install uiseal in your Laravel/Django/Rails/Symfony project, run `uiseal init`, then `uiseal check` (or `uiseal watch` while developing) — template files are picked up automatically by extension. `--fix` rewrites Tailwind classes and CSS values in template files exactly like any other file type, leaving template tags untouched.

## Packages

| Package | Description |
|---------|-------------|
| [`@uiseal/core`](./packages/core) | The rule engine — AST parsing, rule evaluation, token resolution |
| [`@uiseal/cli`](./packages/cli) | CLI + TUI (`uiseal` command) |
| [`@uiseal/github-action`](./packages/github-action) | GitHub Actions integration (coming soon) |

## License

[Elastic License 2.0](./LICENSE) — free for internal use. You may not offer uiseal as a hosted or managed service to third parties.
