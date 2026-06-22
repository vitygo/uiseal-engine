import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  banner: { js: '#!/usr/bin/env node' },
  dts: false,
  splitting: false,
  clean: true,
  esbuildOptions(options) {
    options.jsx = 'automatic';
    options.jsxImportSource = 'react';
  },
});
