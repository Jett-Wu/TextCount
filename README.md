# TextCount

A local-first, no-account, no-AI word and character counting tool for mixed Chinese and English text.

## Privacy

All text is processed entirely in the browser. Nothing is uploaded, and there is no server to
upload to. There is no account, no ads, no analytics, and no third-party runtime requests —
no CDN fonts, no tracking scripts. Your text is never written to `localStorage`, to the URL or
anywhere else; only non-sensitive preferences (theme, interface language, counting rules) are
remembered. Reloading the page clears the document, which is the intended behaviour of this
release.

Honest caveats, because the wording matters:

- **Hosting.** The site is served by GitHub Pages, which may keep standard access logs
  (IP address, user agent, requested URL) as part of delivering the static files. TextCount is
  not an anonymity tool, and the hosting layer is outside our control. Your text never reaches
  GitHub — only the request for the page's static files does.
- **Offline.** "Processed locally" is not the same as "works offline". The first visit needs the
  network to fetch the page. An offline cache (Service Worker) is a possible later optimisation
  and is deliberately not claimed here.

## Measured behaviour

Verified in Chromium against the production build, on a 2026-class laptop:

| Scenario | Result |
|---|---|
| 1,000,000 characters pasted | 3 ms of synchronous work, exact results within 752 ms |
| Main-thread blocking during that scan | no `longtask` entry over 50 ms |
| Keystroke latency at 1,000,000 characters | 3.4–4.1 ms |
| 100,000 matches in a 1,000,000-character document | exact count; 500 positions kept for navigation |
| Production bundle | 22.2 kB gzipped JS, 4.0 kB gzipped CSS |

Counts are never truncated or sampled. Where a browser cannot run the background worker, the
scan falls back to the main thread and says so in the interface rather than degrading silently.

## Status

**P0 — current scope of the first release:**

- Counting: characters, characters excluding whitespace, words, CJK characters, lines, paragraphs
- Find and multi-target check (search several patterns at once and see per-target hits)
- Full-width / half-width punctuation inspection
- UI languages: zh-CN and en
- Light and dark themes

**P1 — planned, not part of the first release:**

- Paragraph length distribution
- Word frequency ranking
- Word cloud

## Development

```bash
npm ci             # reproducible install (npm install works too)
npm run dev        # start the Vite dev server
npm run typecheck  # tsc --noEmit
npm test           # Vitest, unit tests under tests/unit/**/*.test.ts
npm run test:watch # Vitest in watch mode
npm run test:e2e   # Playwright (builds, then serves dist/ under /textcount/)
npm run build      # typecheck + production build into dist/
npm run preview    # serve the built dist/ locally
npm run check      # typecheck + tests + build in one go
```

Node 24 is the verified version. `package-lock.json` is committed; CI and the documented
install path use `npm ci`.

The end-to-end suite runs against the **production build** served from the real `/textcount/`
sub-path, because the two things most likely to break are exactly what a dev-server run hides:
the GitHub Pages base path and the worker bundle URL. Chromium is the default engine; run
`npx playwright install` and set `E2E_ALL_BROWSERS=1` to also cover Firefox and WebKit.

## Documentation

- [AGENTS.md](AGENTS.md) — how agents should work in this repository
- [PROJECT.md](PROJECT.md) — product scope and requirements
- [TASK.md](TASK.md) — task breakdown and progress
- [DEVLOG.md](DEVLOG.md) — development log
- [docs/decisions/](docs/decisions/) — architecture decision records

## Deployment

The site is deployed to GitHub Pages as a **project site**, so it is served from the sub-path
`https://<USERNAME>.github.io/textcount/` rather than from a domain root. `vite.config.ts`
sets `base: '/textcount/'` to match, and every emitted asset URL is prefixed accordingly.

`Settings → Pages → Source` is set to **GitHub Actions**. Any push to `main` triggers
`.github/workflows/deploy.yml`, which typechecks, tests, builds `dist/`, and publishes it via
`actions/upload-pages-artifact` + `actions/deploy-pages`. If the repository is ever renamed to
something other than `textcount`, the `base` value must be updated in lockstep, and a move to a
custom domain or a user/organisation root site requires changing it to `/`.
