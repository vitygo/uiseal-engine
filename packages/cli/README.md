# @uiseal/cli

Design-system governance CLI for JSX/TSX and CSS/SCSS/LESS codebases. Runs as an interactive TUI when invoked without arguments in a TTY; falls through to a standard CLI when arguments are provided or stdin is not a TTY.

## Installation

```sh
npm install -g @uiseal/cli
```

## Quick start

```sh
uiseal           # launch interactive TUI
uiseal check     # non-interactive scan, exits 1 on errors
```

## TUI

Run `uiseal` in a terminal to open the interactive interface.

**Home** — command menu. Navigate with ↑/↓ and Enter.

**Scanning** — live spinner, progress bar, and streaming violation log.

**Results** — violations grouped by file, filterable by category and rule.

### Key bindings

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate violations |
| `←` / `→` | Switch category tab (All / Design / A11y / Security / Quality / variant-sprawl) |
| `Tab` | Toggle rule drill-down — filter the current category by a single rule |
| `n` | Toggle New / All (show only violations introduced after the baseline snapshot) |
| `Enter` | Open selected violation in `$EDITOR` at the exact line |
| `b` / `h` | Back to previous screen |
| `q` | Quit |

## CLI commands

### `uiseal check [path]`

Scan files and report violations. Exits with code 1 on errors, 0 on clean or warnings-only.

```sh
uiseal check
uiseal check src/components
uiseal check --staged                  # only staged files (pre-commit use)
uiseal check --config path/to/dir     # config in a specific directory
uiseal check --update-baseline        # rescan and rewrite baseline, exit 0
uiseal check --no-baseline            # ignore baseline, report all violations
uiseal check --verbose                # full output even for large result sets
```

### `uiseal init`

Scans source files, extracts design tokens, and writes `uiseal.config.json`.

```sh
uiseal init
uiseal init --force    # overwrite existing config
```

### `uiseal baseline <subcommand>`

Manage the design-debt baseline to freeze existing violations.

```sh
uiseal baseline update    # rescan and rewrite the baseline file
uiseal baseline prune     # remove fingerprints for violations that are now fixed
uiseal baseline status    # show baseline path, enabled state, and debt counts
uiseal baseline disable   # set baseline.enabled = false in config
```

### `uiseal diff [base]`

Compare HEAD against a base branch and print a PR review summary.

```sh
uiseal diff
uiseal diff main
uiseal diff --markdown    # output markdown (for PR comments / CI artifacts)
```

### `uiseal install-hooks`

Wires up husky + lint-staged so `uiseal check --staged` runs before every commit. All steps are idempotent.

```sh
uiseal install-hooks
npm install    # install the added devDependencies
```

## Configuration

`uiseal init` generates `uiseal.config.json` at the project root. The loader also accepts `.ts` and `.js`.

```json
{
  "tokens": {
    "colors": {
      "--color-primary": "#0055ff",
      "--color-text": "#1a1a1a"
    },
    "spacing": [4, 8, 16, 24, 32],
    "fontSizes": [12, 14, 16, 18, 24],
    "fontFamilies": ["Inter", "system-ui"],
    "radii": [4, 8, 12]
  },
  "rules": {
    "no-hardcoded-color": "error",
    "no-arbitrary-spacing": "warn",
    "no-arbitrary-font-size": "warn",
    "no-unauthorized-font-family": "error",
    "no-arbitrary-radius": "warn",
    "enforce-contrast": "error",
    "no-img-without-alt": "error",
    "no-missing-form-label": "error"
  },
  "wcag": { "level": "AA" },
  "ignore": [],
  "baseline": {
    "enabled": false,
    "path": ".uiseal-baseline.json"
  }
}
```

Rule severity: `"error"` | `"warn"` | `"off"`.

## Baseline workflow

Use the baseline to freeze existing debt while blocking new violations from being introduced:

1. Run `uiseal baseline update` to snapshot the current state.
2. Commit `.uiseal-baseline.json` to the repository.
3. `uiseal check` now reports only violations added **after** the snapshot.
4. As violations are fixed, run `uiseal baseline prune` to bank the progress.

The TUI results screen has a **New / All** toggle (`n` key) to switch between baseline-filtered and full views.

## CI integration

```yaml
# .github/workflows/uiseal.yml
- run: npx uiseal check
```

Exits with code 1 on errors, 0 on clean or warnings-only.

## Network behaviour

uiseal makes **zero network requests** for design-rule checking. Setting `UISEAL_TOKEN` enables license validation (result cached for 24 hours).

## License

[Elastic License 2.0](./LICENSE) — free to use, modify, and self-host; SaaS re-hosting requires a commercial license.
