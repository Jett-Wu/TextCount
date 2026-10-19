/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
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

/**
 * `cfb` is CommonJS and guards its export with `typeof require`. A bundled browser worker has no
 * global `require`, so the guard has to go — but the only way to remove it is to match the exact
 * source text, which is brittle by construction.
 *
 * That brittleness is why a miss throws instead of returning the code untouched: dev and Node
 * tests run the unbundled module and would keep passing, while the *only* thing that breaks is the
 * DOC import inside the production worker. Failing the build is the cheaper failure.
 */
const CFB_EXPORT_GUARD =
  "if(typeof require !== 'undefined' && typeof module !== 'undefined' && typeof DO_NOT_EXPORT_CFB === 'undefined') { module.exports = CFB; }";
/** The marker makes the transform idempotent and tells a re-run apart from upstream drift. */
const CFB_PATCH = 'module.exports = CFB;/*textcount-cfb-patch*/';

function cfbBrowserInterop(): Plugin {
  return {
    name: 'cfb-browser-interop',
    enforce: 'pre',
    transform(code, id) {
      if (!id.replaceAll('\\', '/').endsWith('/cfb/cfb.js')) return;
      if (code.includes(CFB_EXPORT_GUARD)) return code.replace(CFB_EXPORT_GUARD, CFB_PATCH);
      if (code.includes(CFB_PATCH)) return;
      throw new Error(
        'cfb-browser-interop: the module.exports guard was not found in cfb/cfb.js. ' +
          'The pinned cfb version has probably changed — update CFB_EXPORT_GUARD. Shipping ' +
          'without this patch breaks DOC import only in the browser worker.',
      );
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

/**
 * Enforces the first-load budget that `chunkSizeWarningLimit` cannot express.
 *
 * Raising that limit to silence the parsers would also silence a parser that had been imported
 * statically, which is the failure worth catching: the entry is ~38 kB gzip, and one static
 * `import 'pdfjs-dist'` puts 118 kB gzip on every visitor before they have pasted anything.
 */
function firstLoadBudget(): Plugin {
  const LIMIT_GZIP = 60 * 1024;
  return {
    name: 'first-load-budget',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk' || !chunk.isEntry) continue;
        // Worker builds contribute entries too; only the page's entry is fetched up front.
        if (!/(^|\/)index-[\w-]+\.js$/.test(chunk.fileName)) continue;
        const gzip = gzipSync(Buffer.from(chunk.code)).length;
        if (gzip > LIMIT_GZIP) {
          this.error(
            `first-load-budget: the initial script is ${(gzip / 1024).toFixed(1)} kB gzip, over ` +
              `the ${LIMIT_GZIP / 1024} kB budget. Something that belongs behind a dynamic import ` +
              `is in the first load — check for a new static import of a parser.`,
          );
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [preact(), pdfAssets(), firstLoadBudget()],
  worker: { plugins: () => [cfbBrowserInterop()] },
  base,
  build: {
    target: 'es2022',
    cssTarget: 'chrome111',
    // No source maps in the deployed artifact: publish nothing that is not needed on the host.
    sourcemap: false,
    reportCompressedSize: true,
    /*
     * The two parsers are large on purpose and are never part of the first load: PDF.js is a
     * 1.08 MB worker plus a 398 kB module, and the Word extractor is a 68 kB worker. The default
     * 300 kB limit therefore fired on every single build, which is how a warning becomes
     * wallpaper. The budget that actually matters is the initial chunk, and `firstLoadBudget`
     * enforces that one.
     */
    chunkSizeWarningLimit: 1200,
  },
  test: {
    // The counting engine is framework-free, so unit tests need no DOM.
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    reporters: ['default'],
  },
});
