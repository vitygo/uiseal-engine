# @uiseal/core

AST-based design-system rule engine. Parses JSX/TSX and CSS/PostCSS files, applies configurable rules, and returns typed violations — no Webpack plugin or build-step coupling required.

## Installation

```sh
npm install @uiseal/core
# or
pnpm add @uiseal/core
```

## Usage

```ts
import { analyze } from '@uiseal/core';

const result = await analyze({
  files: new Map([
    ['src/Button.tsx', '<Button style={{ color: "#ff0000" }} />'],
  ]),
  config: {
    ignore: [],
    tokens: {},
    rules: {},
  },
  rules: [],
});

for (const violation of result.violations) {
  console.log(`${violation.file}:${violation.line} — ${violation.message}`);
}
```

## Network behaviour

`@uiseal/core` makes **zero network requests by default**. Providing a `UISEAL_TOKEN` environment variable enables license validation (result cached for 24 hours); no network call is ever made for design-rule checking itself. See `@uiseal/cli` README for the full network policy.

## Docs

Full documentation: https://uiseal.io/docs

## License

[Elastic License 2.0](./LICENSE) — free to use, modify, and self-host; SaaS re-hosting requires a commercial license.
