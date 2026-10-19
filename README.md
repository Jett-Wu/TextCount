<div align="center">

# TextCount

**A local-first text counter for Chinese and English.**

Counts, word frequency, word cloud — nothing leaves your browser.

[**Try it →**](https://jett-wu.github.io/TextCount/) · [Features](#features) · [Development](#development)

**English** · [简体中文](README.zh-CN.md)

[![CI](https://github.com/Jett-Wu/TextCount/actions/workflows/ci.yml/badge.svg)](https://github.com/Jett-Wu/TextCount/actions/workflows/ci.yml)

</div>

![TextCount](docs/screenshot.png)

## Why

Most online counters upload your text, ask you to sign in, or put ads next to it. TextCount is one
static page that does the arithmetic locally: no account, no analytics, no network requests once
the page has loaded.

## Features

- **Mixed Chinese/English counting** that follows Word's 字数 convention — Han characters count one
  each, English words count one each, punctuation stays out of the headline figure.
- **Find, punctuation inspection and analysis** — paragraph distribution, word frequency, and a
  word cloud, computed on demand.
- **Word cloud** with adjustable term count and aspect ratio (1:1 · 4:3 · 16:9 · 16:10), exportable
  as an SVG or a 3000 px PNG.
- **Local PDF / DOCX / DOC import.** Parsers download only when you pick a file.
- **Five languages**, light and dark themes, keyboard and touch friendly.

## Privacy

Text lives in browser memory. It is never uploaded, never written to `localStorage`, never put in
the URL — reloading clears the document. Only preferences (theme, language, counting rules) persist.

The page is served by GitHub Pages, which keeps ordinary access logs; your text never reaches it,
only the request for static files.

> [!NOTE]
> "Processed locally" is not "works offline" — the first visit still needs the network for the page
> itself.

## Development

```bash
npm ci
npm run dev        # Vite dev server
npm run check      # typecheck + unit tests + build
npm run test:e2e   # Playwright against the production build
```

Node 24. Chromium is the default end-to-end engine; `E2E_ALL_BROWSERS=1` adds Firefox and WebKit.
The suite runs against the built app under `/TextCount/` — the same sub-path GitHub Pages serves —
because the base path and the worker URL are exactly what a dev-server run hides.

### A few design notes

- `src/core/` holds every counting rule and stays free of DOM, framework and Node, so the same code
  runs on the main thread, in a worker, and in tests.
- Counts are never truncated or sampled. When the background worker is unavailable, the scan falls
  back to the main thread and says so instead of degrading silently.
- A million characters: about 3 ms of synchronous work, no long task over 50 ms, roughly 3.5 ms
  keystroke latency. Initial bundle: 39 kB gzipped.

## License

MIT — see [LICENSE](LICENSE).
