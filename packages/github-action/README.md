# @uiseal/github-action

GitHub Action that runs uiseal design-system checks on every PR. On `pull_request` events it posts a review comment summarising new violations, fixed violations, and a verdict. On other events (e.g. a push to `main`) it annotates violations inline on the **Files Changed** tab.

## PR review workflow

Add this workflow to `.github/workflows/uiseal.yml` to get a PR review comment on every pull request:

```yaml
name: UISeal PR Review
on:
  pull_request:
    branches: [main]
jobs:
  uiseal:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write   # needed to post the review comment
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0     # full history so the base branch can be fetched
      - uses: your-org/uiseal@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
```

> **Note on permissions:** `pull-requests: write` is required only to post the PR review comment. If you omit the permission (or the `token` input) the action will still run the scan and set exit codes, but the comment step is skipped with a warning.

### What the PR comment shows

- **Verdict** — `✅ Looks good`, `⚠️ Needs attention`, or `🚫 Blocking`
- New blocking violations (must fix before merge)
- New warnings
- Violations fixed by the PR
- Per-file impact table
- Auto-fixable count with `uiseal check --fix` hint

The action updates the same comment on every push to the PR (no spam).

## Push / full-scan workflow

For branches and push events the action falls back to a full scan with inline annotations:

```yaml
name: uiseal

on:
  pull_request:
  push:
    branches: [main]

jobs:
  check:
    name: Design-system check
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read   # needed to fetch changed-file list via API

    steps:
      - uses: actions/checkout@v4

      - uses: your-org/uiseal@v1
        with:
          config: uiseal.config.ts   # path to your config (default)
          report: 'false'            # set 'true' to post metrics to the uiseal backend
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # Optional — only needed when report: 'true'
          # uiseal_TOKEN: ${{ secrets.uiseal_TOKEN }}
          # uiseal_API_URL: ${{ secrets.uiseal_API_URL }}
```

On `pull_request` events the action checks only the files changed in the PR (fetched via the GitHub API). On any other event it falls back to a full scan of all `*.tsx`, `*.jsx`, `*.css`, `*.scss`, and `*.less` files.

## Inputs

| Input    | Default              | Description |
|----------|----------------------|-------------|
| `config` | `uiseal.config.ts`   | Path to the uiseal config file, relative to the repo root. |
| `token`  | `''`                 | GitHub token for posting PR review comments. Pass `${{ secrets.GITHUB_TOKEN }}`. If omitted the comment step is skipped gracefully. |
| `report` | `false`              | When `true`, posts aggregated violation counts to the uiseal backend. Requires `uiseal_TOKEN` and `uiseal_API_URL` environment variables. No source code or file paths are ever transmitted — only counts per rule ID. |

## Outputs

| Output             | Description |
|--------------------|-------------|
| `verdict`          | `pass`, `needs-attention`, or `blocking` |
| `new-violations`   | Number of new violations introduced by this PR |
| `fixed-violations` | Number of violations fixed by this PR |

Outputs are set only on `pull_request` events (the diff-based review path).

## Exit behaviour

| Event | Condition | Result |
|-------|-----------|--------|
| `pull_request` | verdict is `blocking` | `core.setFailed` — blocks the merge |
| `pull_request` | verdict is `needs-attention` or `pass` | exit 0 |
| other | any error-severity violation | `core.setFailed` |
| other | warnings only | exit 0 |

## Making the check required (branch protection)

To block merges on violations, turn the check into a **required status check**:

1. Go to **Settings → Branches** in your repository.
2. Edit (or create) the branch protection rule for your default branch (e.g. `main`).
3. Enable **Require status checks to pass before merging**, then search for and select the job name from the workflow above.
4. Optionally enable **Require branches to be up to date before merging** so the check always runs against the latest base.
