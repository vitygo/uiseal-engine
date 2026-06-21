# @uiseal/cli

Deterministic design-system governance for human and AI-generated code.

## Installation

```
npm install --save-dev @uiseal/cli
```

## Commands

### `uiseal init`

Scans `src/**/*.{tsx,jsx,css}`, extracts design tokens, and writes a `uiseal.config.ts` draft.

```
uiseal init
uiseal init --force   # overwrite an existing config
```

### `uiseal check`

Checks source files against the rules in `uiseal.config.ts`. Exits with code 1 if any errors are found.

```
uiseal check
uiseal check --config path/to/dir   # use a config in a specific directory
uiseal check --staged               # only check files staged in git (pre-commit use)
uiseal check --report               # POST aggregated metrics to uiseal_API_URL
```

### `uiseal install-hooks`

Wires up husky + lint-staged so `uiseal check --staged` runs automatically before every commit.

```
uiseal install-hooks
```

The command:

1. Adds `husky` and `lint-staged` to `devDependencies` in `package.json` if they are not already present.
2. Adds a `prepare: "husky"` script so husky installs itself after `npm install`.
3. Adds a `lint-staged` entry mapping `*.{tsx,jsx,css}` to `uiseal check --staged`.
4. Creates `.husky/pre-commit` containing `npx lint-staged`.

All steps are idempotent — running the command twice changes nothing and reports what already exists.

After running `install-hooks`, install the new dependencies:

```
npm install     # or pnpm install / yarn
```

**Note:** hooks can be bypassed with `--no-verify`. CI checking remains the guarantee — add
`uiseal check` to your CI pipeline to catch anything that slips through.

## Hook setup example

See [`examples/with-hooks/`](../../examples/with-hooks/) for a minimal project with the hook
wired up and a README that walks through the blocked-commit experience.

## Configuration

Create `uiseal.config.ts` at the project root (or run `uiseal init` to generate one):

```ts
import { defineConfig } from '@uiseal/core';

export default defineConfig({
  tokens: {
    colors: {
      '--color-primary': '#0055ff',
      '--color-text': '#1a1a1a',
    },
    spacing: [4, 8, 16, 24, 32],
    fontSizes: [12, 14, 16, 18, 24],
    fontFamilies: ['Inter', 'system-ui'],
    radii: [4, 8, 12],
  },
  rules: {
    'no-hardcoded-color': 'error',
    'no-arbitrary-spacing': 'warn',
    'no-arbitrary-font-size': 'warn',
    'no-unauthorized-font-family': 'error',
    'no-arbitrary-radius': 'warn',
    'enforce-contrast': 'error',
  },
});
```

Rules accept `'error'`, `'warn'`, or `'off'`.

## Network behaviour

uiseal makes **zero network requests by default**. Setting `UISEAL_TOKEN` enables license validation (result cached for 24 hours). Network requests are never made for design-rule checking on the free tier. If you hold a paid license and want to see in-terminal announcements, set `UISEAL_SHOW_BANNER=1`.

## CI integration

```yaml
# .github/workflows/uiseal.yml
- run: npx uiseal check
```

Exits with code 1 on errors, 0 on clean or warnings-only.
