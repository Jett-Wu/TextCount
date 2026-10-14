/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

/**
 * `BASE_PATH` must match the GitHub Pages layout.
 *
 * - Project site (`https://<user>.github.io/textcount/`) -> `/textcount/` (the default).
 * - User/organisation root site (`https://<user>.github.io/`) or a custom domain -> `/`.
 *
 * Every generated asset URL, the lazily imported modules and the worker entry are emitted
 * relative to this base, so it has to be right before the first deploy.
 */
const base = process.env.BASE_PATH ?? '/textcount/';

export default defineConfig({
  plugins: [preact()],
  base,
  build: {
    target: 'es2022',
    cssTarget: 'chrome111',
    // No source maps in the deployed artifact: the app is tiny and we do not want to
    // publish anything that is not needed on the static host.
    sourcemap: false,
    reportCompressedSize: true,
    chunkSizeWarningLimit: 300,
  },
  test: {
    // The counting engine is framework-free, so unit tests need no DOM.
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    reporters: ['default'],
  },
});
