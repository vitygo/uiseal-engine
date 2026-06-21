# UISeal Engine

UISeal's open-core engine — the deterministic AST-based rule engine, CLI, and GitHub Action that power UISeal's design-system governance. Licensed under [Elastic License 2.0](./LICENSE).

## Packages

| Package | Description |
|---------|-------------|
| [`@uiseal/core`](./packages/core) | Deterministic AST-based rule engine for design-system governance |
| [`@uiseal/cli`](./packages/cli) | CLI tool (`uiseal`) for running checks locally |
| [`@uiseal/github-action`](./packages/github-action) | GitHub Action for CI integration |

## Installation

```sh
# Install the CLI
npm install -g @uiseal/cli

# Or add the core engine to your project
npm install @uiseal/core
```

## Usage

```sh
# Run design-system checks in your project
uiseal check

# Initialize a config file
uiseal init
```

For full documentation, visit [https://uiseal.io](https://uiseal.io).

## License

[Elastic License 2.0](./LICENSE) — free to use, modify, and self-host; you may not offer UISeal Engine as a hosted or managed service to third parties.
