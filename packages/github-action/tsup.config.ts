import { defineConfig } from 'tsup';

// @vue/compiler-sfc (a transitive dep via @uiseal/core's Vue SFC parser)
// bundles `consolidate`, which lazy-requires dozens of optional template
// engines (twig, pug, mustache, ...) purely so its own custom
// <template lang="..."> preprocessor support can opt into whichever ones a
// consumer happens to have installed. We only ever call plain parse() —
// none of those lazy-require branches are ever reached — but esbuild still
// tries to statically resolve every one of them when bundling everything
// into a single self-contained file. None of them are (or should be)
// installed, so they're marked external: left as inert `require(...)`
// calls in the output, which is safe since our code never executes them.
const CONSOLIDATE_OPTIONAL_ENGINES = [
  'atpl', 'babel-core', 'bracket-template', 'coffee-script', 'dot', 'dustjs-linkedin',
  'eco', 'ect', 'ejs', 'haml-coffee', 'hamlet', 'hamljs', 'handlebars', 'hogan.js',
  'htmling', 'jazz', 'jqtpl', 'just', 'liquor', 'lodash', 'marko', 'mote', 'mustache',
  'plates', 'ractive', 'react-dom/server', 'slm', 'squirrelly', 'teacup/lib/express',
  'templayed', 'toffee', 'twig', 'twing', 'underscore', 'vash', 'velocityjs', 'walrus',
  'whiskers',
];

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  clean: true,
  noExternal: [/./],
  // tsup's own `external` option doesn't win against a blanket
  // `noExternal: [/./]` — set it directly on the esbuild options instead,
  // which does.
  esbuildOptions(options) {
    options.external = CONSOLIDATE_OPTIONAL_ENGINES;
  },
});
