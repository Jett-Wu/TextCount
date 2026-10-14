import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration.
 *
 * The suite runs against the **production build** served from the real sub-path
 * (`/textcount/`), because the two things most likely to break in this project are exactly the
 * ones a `vite dev` run would hide: the GitHub Pages `base` path and the worker bundle URL.
 *
 * Only Chromium is installed by default. `npx playwright install` followed by
 * `E2E_ALL_BROWSERS=1 npm run test:e2e` enables the Firefox and WebKit projects, which the
 * design reference requires before a release (Intl.Segmenter and Unicode property behaviour
 * differ between engines).
 */

const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}/textcount/`;

const crossBrowser = process.env['E2E_ALL_BROWSERS'] === '1';
const onCi = process.env['CI'] !== undefined;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: onCi,
  retries: onCi ? 1 : 0,
  /*
   * Running three engines at once starves them on a normal machine: measured here, the same 32
   * tests failed in a different place on almost every parallel cross-engine run — a symbol group
   * missing, a cloud SVG missing, a unit switch never landing — and every one of them passed when
   * its engine ran on its own. Serial cross-engine runs cost about 60s against 45s and are
   * reproducible, which is the only property that matters for a release gate. Chromium alone keeps
   * the default parallelism, where there is nothing to contend with.
   */
  ...(crossBrowser ? { workers: 1 } : onCi ? { workers: 2 } : {}),
  reporter: onCi ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: BASE_URL,
    locale: 'en-US',
    timezoneId: 'Asia/Shanghai',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ...(crossBrowser
      ? [
          { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
          { name: 'webkit', use: { ...devices['Desktop Safari'] } },
        ]
      : []),
  ],

  webServer: {
    // Build first so the suite always exercises the real artifact, not a stale `dist/`.
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort --host 127.0.0.1`,
    url: BASE_URL,
    reuseExistingServer: !onCi,
    timeout: 180_000,
  },
});
