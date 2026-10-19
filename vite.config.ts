/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

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

function cfbBrowserInterop(): Plugin {
  return {
    name: 'cfb-browser-interop',
    enforce: 'pre',
    transform(code, id) {
      if (!id.replaceAll('\\', '/').endsWith('/cfb/cfb.js')) return;
      // CFB guards module.exports with typeof require; bundled browsers have no global require.
      return code.replace("if(typeof require !== 'undefined' && typeof module !== 'undefined' && typeof DO_NOT_EXPORT_CFB === 'undefined') { module.exports = CFB; }", 'module.exports = CFB;');
    },
  };
}

/** PDF text decoding occasionally needs CMaps/fonts; these are local, on-demand assets. */
function pdfAssets(): Plugin {
  const root = resolve('node_modules/pdfjs-dist');
  const assets = new Map<string, Uint8Array>();
  return {
    name: 'local-pdf-assets',
    async buildStart() {
      for (const folder of ['cmaps', 'standard_fonts']) {
        for (const name of await readdir(resolve(root, folder))) {
          if (!/\.(bcmap|pfb|ttf)$/.test(name) && !name.startsWith('LICENSE')) continue;
          assets.set(`${folder}/${name}`, await readFile(resolve(root, folder, name)));
        }
      }
      assets.set('LICENSE', await readFile(resolve(root, 'LICENSE')));
      if (this.environment.config.command === 'build') {
        for (const [name, source] of assets) this.emitFile({ type: 'asset', fileName: `pdf-assets/${name}`, source });
        const notices: string[] = [];
        for (const name of ['pdfjs-dist', 'cfb', 'fflate', 'saxes', 'xmlchars', 'adler-32', 'crc-32']) {
          const folder = resolve('node_modules', name);
          const license = (await readdir(folder)).find(file => /^licen[sc]e(?:\.txt|\.md)?$/i.test(file));
          if (license) notices.push(`${name}\n${await readFile(resolve(folder, license), 'utf8')}`);
        }
        this.emitFile({ type: 'asset', fileName: 'import-licenses.txt', source: notices.join('\n\n----------------\n\n') });
      }
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const prefix = `${base}pdf-assets/`;
        const path = request.url?.split('?')[0];
        if (!path?.startsWith(prefix)) return next();
        const asset = assets.get(path.slice(prefix.length));
        if (!asset) { response.statusCode = 404; response.end(); return; }
        response.setHeader('Content-Type', 'application/octet-stream');
        response.end(asset);
      });
    },
  };
}

export default defineConfig({
  plugins: [preact(), pdfAssets()],
  worker: { plugins: () => [cfbBrowserInterop()] },
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
