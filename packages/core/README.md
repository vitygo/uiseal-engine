# @uiseal/core

AST-based design-system lint engine. Parses JSX/TSX and CSS/PostCSS files, applies configurable rules, and returns typed violations. Used by `@uiseal/cli`, the UISeal VS Code extension, and the GitHub Action.

## Installation

```sh
npm install @uiseal/core
```

## Usage

```ts
import { loadConfig, analyze, allRules } from '@uiseal/core';

const { config } = await loadConfig('/path/to/project');

const files = new Map([
  ['src/Button.tsx', '<Button style={{ color: "#ff0000" }} />'],
]);

const { violations } = await analyze({ files, config, rules: allRules });

for (const v of violations) {
  console.log(`${v.file}:${v.line} — ${v.ruleId}: ${v.message}`);
}
```

## Rules

### Design

| Rule | Description |
|------|-------------|
| `no-hardcoded-color` | Literal color values must be CSS custom properties from `tokens.colors` |
| `no-arbitrary-spacing` | Spacing values must appear in `tokens.spacing` |
| `no-arbitrary-font-size` | Font sizes must appear in `tokens.fontSizes` |
| `no-unauthorized-font-family` | Font families must appear in `tokens.fontFamilies` |
| `no-arbitrary-radius` | Border radii must appear in `tokens.radii` |
| `enforce-contrast` | Text/background contrast must meet the configured WCAG level (AA or AAA) |

### Accessibility

| Rule | Description |
|------|-------------|
| `no-img-without-alt` | `<img>` elements must have an `alt` attribute |
| `no-div-button` | Non-semantic `<div onClick>` buttons are disallowed |
| `no-empty-button` | `<button>` elements must have visible text or `aria-label` |
| `no-missing-form-label` | `<input>` elements must have an associated `<label>` or `aria-label` |
| `no-positive-tabindex` | `tabIndex` values above 0 break natural tab order |
| `no-autofocus` | `autoFocus` hinders screen reader predictability |

### Security

| Rule | Description |
|------|-------------|
| `no-xss-dangerous` | Flags unsanitized `dangerouslySetInnerHTML` usage |
| `no-env-in-client` | Disallows `process.env` access in client-side code |
| `no-console-sensitive` | Flags `console.*` calls that may log sensitive data |
| `no-hardcoded-credentials` | Detects hardcoded tokens, passwords, and API keys |

### Quality

| Rule | Description |
|------|-------------|
| `no-magic-numbers` | Numeric literals should be named constants |
| `no-inline-styles` | JSX `style` prop with object literals is disallowed |
| `no-oversized-component` | Components exceeding 300 lines should be split |
| `no-console-log` | `console.log` calls should not be left in production code |
| `no-todo-without-ticket` | TODO/FIXME comments must include a tracking ticket reference |

> **Team tier:** `variant-sprawl` — detects components with excessive prop variants.

## Config schema

```json
{
  "tokens": {
    "colors": { "--color-primary": "#0055ff" },
    "spacing": [4, 8, 16, 24, 32],
    "fontSizes": [12, 14, 16, 18, 24],
    "fontFamilies": ["Inter", "system-ui"],
    "radii": [4, 8, 12]
  },
  "rules": {
    "no-hardcoded-color": "error",
    "no-arbitrary-spacing": "warn",
    "enforce-contrast": "error"
  },
  "wcag": { "level": "AA" },
  "ignore": ["**/node_modules/**", "**/dist/**"],
  "baseline": {
    "enabled": false,
    "path": ".uiseal-baseline.json"
  }
}
```

Rule severity: `"error"` | `"warn"` | `"off"`. Supports `uiseal.config.json`, `uiseal.config.ts`, and `uiseal.config.js`.

## Network behaviour

`@uiseal/core` makes **zero network requests** for design-rule checking. Providing `UISEAL_TOKEN` enables license validation (result cached for 24 hours).

## License

[Elastic License 2.0](./LICENSE) — free to use, modify, and self-host; SaaS re-hosting requires a commercial license.
