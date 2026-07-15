# uiseal

Deterministic design-system linter for human and AI-generated code.

## What it is

uiseal is an AST-based static analysis tool that catches design token violations before they ship. It parses CSS, SCSS, LESS, TSX, JSX, Vue (.vue), Angular (.component.ts), and Svelte (.svelte) files and enforces your design system's rules — hardcoded colors, arbitrary spacing, unauthorized fonts — the same way ESLint enforces code style. Integrates with the CLI, VSCode, and GitHub Actions.

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

## Packages

| Package | Description |
|---------|-------------|
| [`@uiseal/core`](./packages/core) | The rule engine — AST parsing, rule evaluation, token resolution |
| [`@uiseal/cli`](./packages/cli) | CLI + TUI (`uiseal` command) |
| [`@uiseal/github-action`](./packages/github-action) | GitHub Actions integration (coming soon) |

## License

[Elastic License 2.0](./LICENSE) — free for internal use. You may not offer uiseal as a hosted or managed service to third parties.
