/**
 * End-to-end smoke tests for the P0 surface.
 *
 * These run against the built app under `/textcount/`, so they cover the deployment shape as
 * well as the behaviour. The count values asserted here are the same ones pinned by the unit
 * suite — if a rule changes, both suites must be updated together.
 */
import { expect, test, type Page } from '@playwright/test';

const EDITOR = '#textcount-editor';

async function setText(page: Page, text: string): Promise<void> {
  await page.locator(EDITOR).evaluate((element, value) => {
    const textarea = element as HTMLTextAreaElement;
    textarea.value = value;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
}

/** Reads the three headline numbers in DOM order: primary, characters, characters w/o spaces. */
async function headline(page: Page): Promise<string[]> {
  return page.locator('.stats__item .stats__value').allTextContents();
}

async function metrics(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const out: Record<string, string> = {};
    for (const row of document.querySelectorAll('.metrics__row')) {
      const label = row.querySelector('dt')?.textContent ?? '';
      const value = row.querySelector('dd')?.textContent ?? '';
      out[label] = value;
    }
    return out;
  });
}

test.describe('shell and privacy boundary', () => {
  test('loads from the project sub-path and issues no cross-origin requests', async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const external: string[] = [];

    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => {
      const url = request.url();
      if (!url.startsWith('http://127.0.0.1:4173/')) external.push(url);
    });

    await page.goto('/');
    await expect(page.locator(EDITOR)).toBeVisible();

    expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toEqual([]);
    expect(pageErrors, `page errors: ${pageErrors.join(' | ')}`).toEqual([]);
    expect(external, `requests left the site: ${external.join(' | ')}`).toEqual([]);

    // Every hashed asset really is served from the repo sub-path.
    const assetUrls = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((name) => /\.(js|css)$/.test(name)),
    );
    expect(assetUrls.length).toBeGreaterThan(0);
    for (const url of assetUrls) expect(url).toContain('/textcount/assets/');
  });

  test('starts at zero and reports the documented example exactly', async ({ page }) => {
    await page.goto('/');
    expect(await headline(page)).toEqual(['0', '0', '0']);

    await setText(page, '你好 AI 2026');
    expect(await headline(page)).toEqual(['4', '10', '8']);

    const rows = await metrics(page);
    expect(rows['Han characters']).toBe('2');
    expect(rows['English words']).toBe('1');
    expect(rows['Number runs']).toBe('1');
    expect(rows['Punctuation marks']).toBe('0');
    expect(rows['UTF-16 length']).toBe('10');
  });

  test('does not persist the text anywhere', async ({ page }) => {
    await page.goto('/');
    await setText(page, '秘密内容 secret content');

    const stored = await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => key.startsWith('textcount')),
    );
    // Only non-sensitive preferences may be stored.
    for (const key of stored) expect(['textcount.locale', 'textcount.theme', 'textcount.rules']).toContain(key);
    expect(await page.evaluate(() => document.body.innerText)).not.toContain('secret content');

    await page.reload();
    await expect(page.locator(EDITOR)).toHaveValue('');
    expect(await headline(page)).toEqual(['0', '0', '0']);
  });
});

test.describe('counting rules', () => {
  test('switching the primary metric changes the number but never the text', async ({ page }) => {
    await page.goto('/');
    await setText(page, '你好 AI 2026');
    expect((await headline(page))[0]).toBe('4');

    await page.getByRole('button', { name: 'Counting rules' }).click();
    await page.locator('input[name="primary-metric"][value="han"]').check();
    expect((await headline(page))[0]).toBe('2');

    await page.locator('input[name="primary-metric"][value="latinWords"]').check();
    expect((await headline(page))[0]).toBe('1');

    await page.locator('input[name="primary-metric"][value="charsNoSpace"]').check();
    expect((await headline(page))[0]).toBe('8');

    await expect(page.locator(EDITOR)).toHaveValue('你好 AI 2026');
  });

  test('the digit-run and punctuation switches only affect the mixed metric', async ({ page }) => {
    await page.goto('/');
    await setText(page, 'a1');
    expect((await headline(page))[0]).toBe('2');

    await page.getByRole('button', { name: 'Counting rules' }).click();
    await page.getByLabel('Count a run of digits as one unit').uncheck();
    expect((await headline(page))[0]).toBe('1');
    // Character counts are rule-independent.
    expect((await headline(page))[1]).toBe('2');
  });
});

test.describe('find and multi-target checking', () => {
  test('counts non-overlapping matches of a repeated term', async ({ page }) => {
    await page.goto('/');
    await setText(page, 'aaaa');
    await page.locator('#textcount-tab-search').click();

    await page.locator('.search-form .input').fill('aa');
    await page.locator('.search-form .btn--primary').click();

    await expect(page.locator('[data-testid="search-term"] .term__count')).toHaveText('2 matches');
  });

  test('locates a match and selects it in the original text', async ({ page }) => {
    await page.goto('/');
    await setText(page, 'aaaa');
    await page.locator('#textcount-tab-search').click();
    await page.locator('.search-form .input').fill('aa');
    await page.locator('.search-form .btn--primary').click();
    await expect(page.locator('.term__position')).toHaveText('Match 1 of 2');

    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.locator('.term__position')).toHaveText('Match 2 of 2');

    const selection = await page.locator(EDITOR).evaluate((element) => {
      const textarea = element as HTMLTextAreaElement;
      return {
        start: textarea.selectionStart,
        end: textarea.selectionEnd,
        text: textarea.value.slice(textarea.selectionStart, textarea.selectionEnd),
      };
    });
    expect(selection).toEqual({ start: 2, end: 4, text: 'aa' });
    // The document itself is untouched: this is a read-only tool.
    await expect(page.locator(EDITOR)).toHaveValue('aaaa');
  });

  test('checks several targets at once and never merges , with ，', async ({ page }) => {
    await page.goto('/');
    await setText(page, 'a,b，c');
    await page.locator('#textcount-tab-search').click();

    for (const term of [',', '，']) {
      await page.locator('.search-form .input').fill(term);
      await page.locator('.search-form .btn--primary').click();
    }

    const terms = page.locator('[data-testid="search-term"]');
    await expect(terms).toHaveCount(2);
    await expect(terms.nth(0).locator('.term__count')).toHaveText('1 match');
    await expect(terms.nth(1).locator('.term__count')).toHaveText('1 match');
  });

  test('a target with no matches can still be selected and reports its empty result', async ({
    page,
  }) => {
    await page.goto('/');
    await setText(page, '今天天气很好。');
    await page.locator('#textcount-tab-search').click();

    for (const term of ['天气', '不存在的词']) {
      await page.locator('.search-form .input').fill(term);
      await page.locator('.search-form .btn--primary').click();
      await page.waitForTimeout(250);
    }

    const terms = page.locator('[data-testid="search-term"]');
    await expect(terms.nth(1).locator('.term__count')).toHaveText('No match');

    // Selecting the zero-match target must work: the user added it to confirm it is absent, so
    // the panel has to be able to say so rather than silently ignoring the click.
    await terms.nth(1).locator('.term__button').click();
    await expect(terms.nth(1)).toHaveClass(/term--active/);
    await expect(page.locator('[data-testid="search-context-empty"]')).toBeVisible();

    // And the hitting target still navigates normally afterwards.
    await terms.nth(0).locator('.term__button').click();
    await expect(terms.nth(0)).toHaveClass(/term--active/);
    await expect(page.locator('[data-testid="search-context"]')).toBeVisible();
  });
});

test.describe('full-width / half-width inspection', () => {
  test('flags mixed parenthesis widths', async ({ page }) => {
    await page.goto('/');
    await setText(page, 'half (a) and full （b）');
    await page.locator('#textcount-tab-symbols').click();

    const paren = page.locator('[data-testid="symbol-group-paren"]');
    await expect(paren).toBeVisible();
    await expect(paren.locator('.badge')).toHaveText('More than one form');
  });

  test('does not flag a single-form full stop', async ({ page }) => {
    await page.goto('/');
    await setText(page, '你好。世界。');
    await page.locator('#textcount-tab-symbols').click();

    const period = page.locator('[data-testid="symbol-group-period"]');
    await expect(period).toBeVisible();
    await expect(period.locator('.badge')).toHaveText('One form only');

    // 。 counts as CJK punctuation, never as a Han character. The detail rows only exist while
    // the statistics tab is mounted, so switch back before reading them.
    await page.locator('#textcount-tab-stats').click();
    const rows = await metrics(page);
    expect(rows['Han characters']).toBe('4');
    expect(rows['Punctuation marks']).toBe('2');
  });

  test('locating a symbol selects the exact character in the text', async ({ page }) => {
    await page.goto('/');
    await setText(page, 'a,b，c');
    await page.locator('#textcount-tab-symbols').click();

    await page.locator('[data-testid="symbol-group-comma"] .chip').first().click();
    const selected = await page.locator(EDITOR).evaluate((element) => {
      const textarea = element as HTMLTextAreaElement;
      return {
        charCode: textarea.value.charCodeAt(textarea.selectionStart).toString(16),
        value: textarea.value.slice(textarea.selectionStart, textarea.selectionEnd),
      };
    });
    expect(selected).toEqual({ charCode: '2c', value: ',' });
  });
});

test.describe('interface language', () => {
  test('switches language without losing the text or the selection', async ({ page }) => {
    await page.goto('/');
    await setText(page, '你好 AI 2026');
    await page.locator(EDITOR).evaluate((element) => {
      const textarea = element as HTMLTextAreaElement;
      textarea.focus();
      // `你好 AI 2026` — offsets 3..5 are exactly "AI".
      textarea.setSelectionRange(3, 5);
    });

    await page.locator('.segmented[data-control="locale"] .segmented__item').nth(0).click();

    await expect(page.locator('.stats__item--lead .stats__label')).toHaveText('字数');
    await expect(page.locator('#textcount-tab-search')).toHaveText('查找');
    await expect(page).toHaveTitle(/TextCount/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');

    await expect(page.locator(EDITOR)).toHaveValue('你好 AI 2026');
    const selection = await page.locator(EDITOR).evaluate((element) => {
      const textarea = element as HTMLTextAreaElement;
      return textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
    });
    expect(selection).toBe('AI');
  });

  test('English copy does not break the layout on a narrow screen', async ({ page }) => {
    // English labels are materially longer ("Characters (with spaces)"), which is exactly where
    // a control that only fits the Chinese string starts to push the page sideways.
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/');
    await setText(page, '你好');

    await page.locator('.segmented[data-control="locale"] .segmented__item').nth(1).click();
    await expect(page.locator('#textcount-tab-search')).toHaveText('Find');

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
    await expect(page.locator(EDITOR)).toHaveValue('你好');
  });
});

test.describe('theme', () => {
  test('switching theme repaints, and keeps the text and the selection', async ({ page }) => {
    await page.goto('/');
    await setText(page, '你好 AI 2026');
    await page.locator(EDITOR).evaluate((element) => {
      const textarea = element as HTMLTextAreaElement;
      textarea.focus();
      textarea.setSelectionRange(3, 5);
    });

    const themeSwitch = page.locator('.segmented[data-control="theme"] .segmented__item');
    await themeSwitch.nth(2).click(); // dark
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const darkBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    await themeSwitch.nth(1).click(); // light
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const lightBackground = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(lightBackground).not.toBe(darkBackground);

    // The document is untouched by a repaint.
    await expect(page.locator(EDITOR)).toHaveValue('你好 AI 2026');
    const selection = await page.locator(EDITOR).evaluate((element) => {
      const textarea = element as HTMLTextAreaElement;
      return textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
    });
    expect(selection).toBe('AI');
  });
});

test.describe('long text', () => {
  test('counts 200,000 characters exactly without blocking the main thread', async ({ page }) => {
    await page.goto('/');
    await page.locator(EDITOR).click();

    const result = await page.locator(EDITOR).evaluate(async (element, unit) => {
      const textarea = element as HTMLTextAreaElement;
      const text = unit.repeat(20_000); // 200,000 UTF-16 code units

      const longTasks: number[] = [];
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longTasks.push(entry.duration);
      });
      try {
        observer.observe({ entryTypes: ['longtask'] });
      } catch {
        /* longtask unsupported in this engine */
      }

      const started = performance.now();
      textarea.value = text;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      const synchronousCost = performance.now() - started;

      const headlineValues = () =>
        [...document.querySelectorAll('.stats__item .stats__value')].map(
          (node) => node.textContent ?? '',
        );

      let settle = 0;
      while (performance.now() - started < 30_000) {
        if (headlineValues()[1] === '200,000') break;
        await new Promise((resolve) => setTimeout(resolve, 25));
        settle = performance.now() - started;
      }
      observer.disconnect();

      const rows: Record<string, string> = {};
      for (const row of document.querySelectorAll('.metrics__row')) {
        rows[row.querySelector('dt')?.textContent ?? ''] = row.querySelector('dd')?.textContent ?? '';
      }

      return { synchronousCost, settle, headlineValues: headlineValues(), rows, longTasks };
    }, '汉字abc123，。');

    // Exact counts: no truncation, no sampling.
    // 20,000 units of `汉字abc123，。` → mixed = 20,000 x (2 Han + 1 word + 1 digit run) = 80,000.
    expect(result.headlineValues).toEqual(['80,000', '200,000', '200,000']);
    expect(result.rows['Han characters']).toBe('40,000');
    expect(result.rows['Punctuation marks']).toBe('40,000');
    expect(result.rows['UTF-16 length']).toBe('200,000');

    // The keystroke itself must stay well inside a frame: this is the input handler's own cost.
    expect(result.synchronousCost).toBeLessThan(100);
    // The scan itself runs in the worker, so what can still block the main thread here is the
    // textarea laying out 200,000 characters — the "editor control cost" the design reference
    // warns about, not the counting. The bound is therefore deliberately loose enough to absorb
    // a loaded machine (parallel browser contexts) while still catching a real freeze. The exact
    // counts and the synchronous cost above are the strict assertions.
    expect(Math.max(0, ...result.longTasks)).toBeLessThan(600);
    // Results must still arrive promptly even when the machine is busy.
    expect(result.settle).toBeLessThan(10_000);
  });
});

test.describe('accessibility basics', () => {
  test('exposes tabs, a labelled editor and a rules menu that closes on Escape', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(EDITOR)).toHaveAttribute('aria-label', 'Text input');
    await expect(page.locator('#textcount-tab-stats')).toHaveAttribute('aria-selected', 'true');

    const rules = page.locator('.rules');
    await expect(rules).toHaveCount(0);
    await page.getByRole('button', { name: 'Counting rules' }).click();
    await expect(rules).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(rules).toHaveCount(0);
  });

  test('moves between tool tabs with the keyboard', async ({ page }) => {
    await page.goto('/');
    await page.locator('#textcount-tab-stats').click();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#textcount-tab-search')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#textcount-tab-symbols')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#textcount-tab-stats')).toHaveAttribute('aria-selected', 'true');
  });
});

/**
 * The layout has to hold up on the devices people actually use, and the failure modes are
 * silent: nothing errors, the page just overflows or pushes the tools below the fold.
 */
test.describe('responsive layout', () => {
  const VIEWPORTS = [
    { name: 'small phone', width: 320, height: 568 },
    { name: 'phone', width: 390, height: 844 },
    { name: 'phone landscape', width: 844, height: 390 },
    { name: 'tablet portrait', width: 834, height: 1194 },
    { name: 'tablet landscape', width: 1024, height: 768 },
    { name: 'laptop', width: 1366, height: 768 },
    { name: 'desktop', width: 1920, height: 1080 },
  ];

  for (const viewport of VIEWPORTS) {
    test(`holds up at ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');
      await setText(page, '这是一个把 Word 里的文字粘进来、立刻得到可信统计的小工具。');

      const layout = await page.evaluate(() => {
        const rect = (selector: string) => {
          const node = document.querySelector(selector);
          if (node === null) return null;
          const box = node.getBoundingClientRect();
          return { width: box.width, height: box.height, top: box.top, bottom: box.bottom };
        };
        const valueBottoms = [...document.querySelectorAll('.stats__item')].map((cell) =>
          Math.round(cell.querySelector('.stats__value')!.getBoundingClientRect().bottom),
        );
        return {
          innerHeight: window.innerHeight,
          horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          primaryFontSize: Number.parseFloat(
            getComputedStyle(document.querySelector('.stats__item--lead .stats__value')!).fontSize,
          ),
          secondaryFontSize: Number.parseFloat(
            getComputedStyle(
              document.querySelector('.stats__item:not(.stats__item--lead) .stats__value')!,
            ).fontSize,
          ),
          editor: rect('.editor')!,
          tools: rect('.tools')!,
          toolbar: rect('.topbar')!,
          valueBottoms,
        };
      });

      expect(layout.horizontalOverflow).toBe(false);
      // The editor must stay a usable size everywhere, including a 375px-tall landscape phone.
      expect(layout.editor.height).toBeGreaterThan(120);
      // The tools must be reachable without scrolling past them first.
      expect(layout.tools.top).toBeLessThan(layout.innerHeight);
      // The two secondary figures always share one baseline: they stay in the same row even when
      // the primary count moves to a row of its own on a narrow screen.
      expect(new Set(layout.valueBottoms.slice(1)).size).toBe(1);
      // The headline count is the largest of the three at every size.
      expect(layout.primaryFontSize).toBeGreaterThan(layout.secondaryFontSize);
      // The header must not eat the screen on a small phone.
      expect(layout.toolbar.height).toBeLessThan(viewport.height * 0.25);
    });
  }
});
