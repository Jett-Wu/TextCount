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

async function chooseLocale(page: Page, locale: string): Promise<void> {
  await page.locator('[data-control="locale"]').click();
  await page.locator(`[role="menuitemradio"][data-locale="${locale}"]`).click();
}

/** Headline: selected count, characters including whitespace, paragraphs. */
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
    expect(await headline(page)).toEqual(['4', '10', '1']);

    const rows = await metrics(page);
    expect(rows['Han characters']).toBe('2');
    expect(rows['English words']).toBe('1');
    expect(rows['Number runs']).toBe('1');
    expect(rows['Punctuation marks']).toBe('0');
    expect(rows['UTF-16 length']).toBe('10');
    expect(rows['Characters without spaces']).toBe('8');
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
  test('keeps search inputs across tools and recomputes after the text changes', async ({ page }) => {
    await page.goto('/');
    await setText(page, 'hello hello Hello');
    await page.locator('#textcount-tab-search').click();
    await page.locator('.search-form .input').fill('hello');
    await page.locator('.search-form .btn--primary').click();
    await page.getByLabel('Match case').uncheck();
    await expect(page.locator('.term__count')).toHaveText('3 matches');
    await page.locator('.search-form .input').fill('unfinished draft');
    await page.locator('#textcount-tab-stats').click();
    await setText(page, 'Hello');
    await page.locator('#textcount-tab-search').click();
    await expect(page.locator('.search-form .input')).toHaveValue('unfinished draft');
    await expect(page.getByLabel('Match case')).not.toBeChecked();
    await expect(page.locator('.term__count')).toHaveText('1 match');
    await page.reload();
    await page.locator('#textcount-tab-search').click();
    await expect(page.locator('[data-testid="search-term"]')).toHaveCount(0);
    await expect(page.locator('.search-form .input')).toHaveValue('');
  });
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

  /*
   * A symbol chip used to jump to the first occurrence and stop there, so a reader who wanted the
   * fourth comma had to scroll and find it by eye. The navigator is the same one the find panel
   * uses; these tests hold it to the same behaviour, including wrapping in both directions.
   */
  test('walks through every occurrence of a symbol', async ({ page }) => {
    await page.goto('/');
    await setText(page, '你好。世界。再见。第四句。');
    await page.locator('#textcount-tab-symbols').click();

    const positionOf = (): Promise<number> =>
      page.locator(EDITOR).evaluate((element) => (element as HTMLTextAreaElement).selectionStart);
    const nav = page.locator('.chip-nav');

    const position = nav.locator('.chip-nav__position');
    await page.locator('[data-testid="symbol-group-period"] .chip').first().click();
    await expect(nav).toHaveCount(1);
    await expect(position).toHaveAttribute('data-index', '1');
    await expect(position).toHaveAttribute('data-total', '4');
    expect(await positionOf()).toBe(2);

    await nav.locator('button').last().click();
    await expect(position).toHaveAttribute('data-index', '2');
    expect(await positionOf()).toBe(5);

    await nav.locator('button').last().click();
    expect(await positionOf()).toBe(8);

    // Two more steps: third, then wrap to the first.
    await nav.locator('button').last().click();
    expect(await positionOf()).toBe(12);
    await nav.locator('button').last().click();
    await expect(position).toHaveAttribute('data-index', '1');
    expect(await positionOf()).toBe(2);

    // And backwards from the first wraps to the last.
    await nav.locator('button').first().click();
    await expect(position).toHaveAttribute('data-index', '4');
    expect(await positionOf()).toBe(12);
  });

  /*
   * The same character appears in both the related-forms group and the category list. Keying the
   * active state on the character rather than the chip highlighted both and rendered two
   * navigators for one symbol.
   */
  test('shows one navigator even when the symbol is listed twice', async ({ page }) => {
    await page.goto('/');
    await setText(page, '你好。世界。再见，第三句，');
    await page.locator('#textcount-tab-symbols').click();

    await page.locator('[data-testid="symbol-group-period"] .chip').first().click();
    await expect(page.locator('.chip-nav')).toHaveCount(1);
    await expect(page.locator('.chip--active, .sym--active')).toHaveCount(1);
    const periodPosition = await page
      .locator(EDITOR)
      .evaluate((element) => (element as HTMLTextAreaElement).selectionStart);
    expect(periodPosition).toBe(2);

    // Choosing a different symbol moves the navigator rather than adding another.
    await page.locator('[data-testid="symbol-group-comma"] .chip').first().click();
    await expect(page.locator('.chip-nav')).toHaveCount(1);
    await expect(page.locator('.chip--active, .sym--active')).toHaveCount(1);
    const commaPosition = await page
      .locator(EDITOR)
      .evaluate((element) => (element as HTMLTextAreaElement).selectionStart);
    expect(commaPosition).toBe(8);
  });

  test('steps a symbol to nothing when it occurs once', async ({ page }) => {
    await page.goto('/');
    await setText(page, '你好。世界');
    await page.locator('#textcount-tab-symbols').click();

    await page.locator('[data-testid="symbol-group-period"] .chip').first().click();
    // One occurrence: the chip still locates, but there is nothing to step through.
    await expect(page.locator('.chip-nav')).toHaveCount(0);
    const position = await page
      .locator(EDITOR)
      .evaluate((element) => (element as HTMLTextAreaElement).selectionStart);
    expect(position).toBe(2);
  });

  test('drops the symbol navigator when the document changes', async ({ page }) => {
    await page.goto('/');
    await setText(page, '你好。世界。再见。第四句。');
    await page.locator('#textcount-tab-symbols').click();
    await page.locator('[data-testid="symbol-group-period"] .chip').first().click();
    await expect(page.locator('.chip-nav')).toHaveCount(1);
    await setText(page, 'A different document!');
    await expect(page.locator('.chip-nav')).toHaveCount(0);
    await expect(page.locator('.chip--active, .sym--active')).toHaveCount(0);
  });
});

test.describe('interface language', () => {
  test('language menu supports arrows, Escape, Tab and outside dismissal', async ({ page }) => {
    await page.goto('/');
    const trigger = page.locator('[data-control="locale"]');
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitemradio', { name: 'English', exact: true })).toBeFocused();
    await page.keyboard.press('End');
    await expect(page.getByRole('menuitemradio', { name: 'Français', exact: true })).toBeFocused();
    await page.keyboard.press('Home');
    await expect(page.getByRole('menuitemradio', { name: '中文', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await expect(page.getByRole('menu')).toHaveCount(0);
    await trigger.click();
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-control="theme"]')).toBeFocused();
    await expect(page.getByRole('menu')).toHaveCount(0);
    await trigger.click();
    await page.locator(EDITOR).click();
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(page.locator(EDITOR)).toBeFocused();
    await trigger.click();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
    await expect(trigger).toBeFocused();
  });

  test('supports every language without changing text, selection or counts', async ({ page }) => {
    await page.goto('/');
    await setText(page, '你好 AI 2026');
    await page.locator(EDITOR).evaluate((element) => {
      (element as HTMLTextAreaElement).setSelectionRange(3, 5);
    });
    for (const locale of ['ja', 'es', 'fr', 'zh-CN', 'en']) {
      await chooseLocale(page, locale);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      expect(await headline(page)).toEqual(['4', '10', '1']);
      expect(await page.locator(EDITOR).evaluate((element) => {
        const textarea = element as HTMLTextAreaElement;
        return textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
      })).toBe('AI');
      await expect(page.locator(EDITOR)).toHaveValue('你好 AI 2026');
    }
    const link = page.getByRole('link', { name: 'GitHub' });
    await expect(link).toHaveAttribute('href', 'https://github.com/Jett-Wu');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('switches language without losing the text or the selection', async ({ page }) => {
    await page.goto('/');
    await setText(page, '你好 AI 2026');
    await page.locator(EDITOR).evaluate((element) => {
      const textarea = element as HTMLTextAreaElement;
      textarea.focus();
      // `你好 AI 2026` — offsets 3..5 are exactly "AI".
      textarea.setSelectionRange(3, 5);
    });

    await chooseLocale(page, 'zh-CN');

    await expect(page.locator('.stats__item--lead .stats__label')).toHaveText('字词');
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

    await chooseLocale(page, 'en');
    await expect(page.locator('#textcount-tab-search')).toHaveText('Find');

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
    await expect(page.locator(EDITOR)).toHaveValue('你好');
  });
});

test.describe('theme', () => {
  test('cycles in one click and follows system changes after a full cycle', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    const toggle = page.locator('[data-control="theme"]');
    await expect(toggle).toHaveAttribute('data-theme-preference', 'system');
    for (const preference of ['light', 'dark', 'system']) {
      await toggle.click();
      await expect(toggle).toHaveAttribute('data-theme-preference', preference);
    }
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(28, 28, 29)');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(247, 247, 249)');
    await toggle.click();
    await page.reload();
    await expect(toggle).toHaveAttribute('data-theme-preference', 'light');
    await expect(page.locator('select')).toHaveCount(0);
  });

  test('switching theme repaints, and keeps the text and the selection', async ({ page }) => {
    await page.goto('/');
    await setText(page, '你好 AI 2026');
    await page.locator(EDITOR).evaluate((element) => {
      const textarea = element as HTMLTextAreaElement;
      textarea.focus();
      textarea.setSelectionRange(3, 5);
    });

    const themeSwitch = page.locator('[data-control="theme"]');
    await themeSwitch.click(); // system → light
    await themeSwitch.click(); // light → dark
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(28, 28, 29)');
    const darkBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    await themeSwitch.click(); // dark → system
    await themeSwitch.click(); // system → light
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(247, 247, 249)');
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
    expect(result.headlineValues).toEqual(['80,000', '200,000', '1']);
    expect(result.rows['Characters without spaces']).toBe('200,000');
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
  test('reverses a closing rules menu and restores keyboard access immediately', async ({ page }) => {
    await page.goto('/');
    const trigger = page.getByRole('button', { name: 'Counting rules' });
    for (let attempt = 0; attempt < 5; attempt++) {
      await trigger.click();
      await expect(page.getByRole('radio').first()).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await trigger.evaluate((button) => (button as HTMLButtonElement).click());
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('#textcount-rules')).not.toHaveAttribute('inert');
      await trigger.focus();
      await expect(trigger).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.locator('input[name="primary-metric"][value="mixed"]')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('radio')).toHaveCount(0);
      await trigger.focus();
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement?.closest('#textcount-rules') !== null)).toBe(false);
    }
  });

  test('rapid keyboard navigation keeps the document and ends at the latest tab', async ({ page }) => {
    await page.goto('/');
    await setText(page, '你好 AI 2026');
    await page.locator(EDITOR).evaluate((element) => {
      const textarea = element as HTMLTextAreaElement;
      textarea.setSelectionRange(3, 5);
    });
    const editor = await page.locator(EDITOR).elementHandle();
    await page.locator('#textcount-tab-stats').focus();
    for (let step = 0; step < 7; step++) await page.keyboard.press('ArrowRight');
    await expect(page.locator('#textcount-tab-insights')).toBeFocused();
    await expect(page.locator('#textcount-tab-insights')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-testid="panel-insights"]')).toBeVisible();
    expect(await editor!.evaluate((element) => {
      const textarea = element as HTMLTextAreaElement;
      return { connected: textarea.isConnected, text: textarea.value,
        selection: textarea.value.slice(textarea.selectionStart, textarea.selectionEnd) };
    })).toEqual({ connected: true, text: '你好 AI 2026', selection: 'AI' });
  });

  test('exposes tabs, a labelled editor and a rules menu that closes on Escape', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(EDITOR)).toHaveAttribute('aria-label', 'Text input');
    await expect(page.locator('#textcount-tab-stats')).toHaveAttribute('aria-selected', 'true');

    const rules = page.locator('.rules');
    await expect(rules).not.toBeVisible();
    await expect(page.getByRole('radio')).toHaveCount(0);
    await page.getByRole('button', { name: 'Counting rules' }).click();
    await expect(rules).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(rules).not.toBeVisible();
    await expect(page.getByRole('radio')).toHaveCount(0);
  });

  test('moves between tool tabs with the keyboard', async ({ page }) => {
    await page.goto('/');
    await page.locator('#textcount-tab-stats').click();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#textcount-tab-search')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#textcount-tab-symbols')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#textcount-tab-insights')).toHaveAttribute('aria-selected', 'true');
    // Wraps around to the first tool.
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#textcount-tab-stats')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End');
    await expect(page.locator('#textcount-tab-insights')).toBeFocused();
    await expect(page.locator('#textcount-tab-insights')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(page.locator('#textcount-tab-stats')).toBeFocused();
    await expect(page.locator('#textcount-tab-stats')).toHaveAttribute('aria-selected', 'true');
  });
});

/**
 * The layout has to hold up on the devices people actually use, and the failure modes are
 * silent: nothing errors, the page just overflows or pushes the tools below the fold.
 */
test.describe('insights', () => {
  test('remembers the analysis view and options when returning from another tool', async ({ page }) => {
    await page.goto('/');
    await setText(page, '文字文字 hello hello');
    await page.locator('#textcount-tab-insights').click();
    await page.locator('[data-testid="insights-views"]').getByRole('button', { name: 'Frequency' }).click();
    await page.getByLabel('Filter common function words').uncheck();
    await page.locator('[data-testid="insights-unit"]').getByRole('button', { name: 'Characters' }).click();
    await page.locator('#textcount-tab-stats').click();
    await setText(page, '字字');
    await page.locator('#textcount-tab-insights').click();
    await expect(page.locator('[data-testid="insights-views"]').getByRole('button', { name: 'Frequency' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-testid="insights-unit"]').getByRole('button', { name: 'Characters' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.bars__term')).toHaveText(['字']);
    await expect(page.locator('.bars__value')).toHaveText(['2']);
    await page.locator('[data-testid="insights-unit"]').getByRole('button', { name: 'Words', exact: true }).click();
    await expect(page.getByLabel('Filter common function words')).not.toBeChecked();
  });
  const MULTI = [
    '第一段很短。',
    '',
    '第二段稍微长一些，用来验证段落长度的排序与定位是否对得上原文。',
    '',
    '工具 工具 工具 工具 工具。',
    '工具 和 汉字 汉字 汉字。',
  ].join('\n');

  test('reports paragraph distribution and reveals a paragraph on click', async ({ page }) => {
    await page.goto('/');
    await setText(page, MULTI);
    await page.locator('#textcount-tab-insights').click();
    // The cloud is the default sub-view now, so ask for the paragraph list explicitly.
    await page
      .locator('[data-testid="insights-views"]')
      .getByRole('button', { name: 'Paragraphs' })
      .click();

    // 4 paragraphs, 2 blank lines: the two empty lines between blocks.
    await expect(page.locator('[data-testid="panel-insights"] .metrics__row').nth(0)).toContainText(
      '4',
    );
    const rows = page.locator('.bars__row');
    await expect(rows).toHaveCount(4);

    // Document order: 6, 31, 15 and 14 user-perceived characters.
    await expect(rows.nth(0).locator('.bars__value')).toHaveText('6');
    await expect(rows.nth(1).locator('.bars__value')).toHaveText('31');

    // Sorting by length puts the longest first.
    await page
      .locator('[data-testid="insights-order"]')
      .getByRole('button', { name: 'By length' })
      .click();
    await expect(rows.nth(0).locator('.bars__value')).toHaveText('31');

    // Clicking a paragraph selects exactly that paragraph in the original text. Compared against
    // the source array rather than a retyped literal, so a typo cannot masquerade as a bug.
    await rows.nth(0).click();
    const selected = await page.locator(EDITOR).evaluate((element) => {
      const textarea = element as HTMLTextAreaElement;
      return textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
    });
    expect(selected).toBe(MULTI.split('\n')[2]);
  });

  test('ranks terms and switches between word and character units', async ({ page }) => {
    await page.goto('/');
    await setText(page, MULTI);
    await page.locator('#textcount-tab-insights').click();
    await page
      .locator('[data-testid="insights-views"]')
      .getByRole('button', { name: 'Frequency' })
      .click();

    /*
     * Assertions here stay engine-independent on purpose. `Intl.Segmenter` for Chinese is
     * dictionary-driven in Chromium's ICU but character-level in Firefox's, so both are correct
     * outputs and neither may be asserted as *the* answer. What must hold everywhere: rows carry
     * positive integer counts, the ranking descends, and the two units behave as documented.
     */
    const rows = page.locator('.bars__row');
    await expect(rows.first()).toBeVisible();
    const counts = (await page.locator('.bars__value').allTextContents()).map(Number);
    expect(counts.length).toBeGreaterThan(0);
    for (const count of counts) expect(Number.isInteger(count) && count > 0).toBe(true);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);

    const summaryTokens = async (): Promise<number> => {
      const text = (await page.locator('[data-testid="insights-summary"]').textContent()) ?? '';
      return Number(text.replace(/[^\d].*$/, ''));
    };

    // Filtering function words can only remove tokens, never add them.
    const filtered = await summaryTokens();
    await page.getByLabel('Filter common function words').uncheck();
    await expect
      .poll(async () => summaryTokens())
      .toBeGreaterThanOrEqual(filtered);

    // Character frequency counts Han and kana only, one character per row.
    await page
      .locator('[data-testid="insights-unit"]')
      .getByRole('button', { name: 'Characters' })
      .click();
    await expect
      .poll(async () => {
        const terms = await page.locator('.bars__term').allTextContents();
        return (
          terms.length > 0 &&
          terms.every((term) => /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u.test(term))
        );
      })
      .toBe(true);

    const terms = await page.locator('.bars__term').allTextContents();
    expect(terms).toContain('汉');
    expect(terms).toContain('工');
  });

  test('loads the word cloud lazily and reveals a word on click', async ({ page }) => {
    const cloudRequests: string[] = [];
    page.on('request', (request) => {
      if (/WordCloud/i.test(request.url())) cloudRequests.push(request.url());
    });

    await page.goto('/');
    await setText(page, MULTI);
    await page.locator('#textcount-tab-insights').click();
    await page
      .locator('[data-testid="insights-views"]')
      .getByRole('button', { name: 'Cloud' })
      .click();

    // The cloud only renders inside the insights tool, so nothing may have fetched it earlier.
    await expect(page.locator('.cloud svg')).toBeVisible();
    expect(cloudRequests.length).toBeGreaterThan(0);

    // Every label carries its term and exact count; which terms appear depends on the engine's
    // segmentation, so the assertion is on the shape, not on a particular Chinese word.
    const labels = await page.locator('.cloud svg text').evaluateAll((nodes) =>
      nodes.map((node) => node.textContent ?? ''),
    );
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) expect(label).toMatch(/^.+: \d+/);

    /*
     * The rendered attributes are asserted, not just the props. `fontSize`, `textAnchor` and
     * `fillOpacity` all type-check as JSX but Preact writes them through verbatim, so SVG ignored
     * them: every word drew at the 16px default, left-anchored and fully opaque, and the layout's
     * collision boxes no longer matched the drawn text. Nothing about the output looked broken
     * enough to notice without measuring.
     */
    const rendered = await page.locator('.cloud svg text').evaluateAll((nodes) =>
      nodes.map((node) => ({
        size: Number(node.getAttribute('font-size')),
        opacity: Number(node.getAttribute('fill-opacity')),
        anchor: node.getAttribute('text-anchor'),
        baseline: node.getAttribute('dominant-baseline'),
      })),
    );
    for (const word of rendered) {
      expect(Number.isFinite(word.size) && word.size > 0).toBe(true);
      expect(Number.isFinite(word.opacity) && word.opacity > 0).toBe(true);
      expect(word.anchor).toBe('middle');
      expect(word.baseline).toBe('middle');
    }
    /*
     * Sizes must encode frequency rather than all collapsing to one value — but only where the
     * counts actually differ. Firefox has no Chinese dictionary, so every count there is 1 and a
     * single size is the correct output, not a regression.
     */
    const counts = labels.map((label) => Number(/^.+: (\d+)/.exec(label)?.[1] ?? '0'));
    if (new Set(counts).size > 1) {
      expect(new Set(rendered.map((word) => word.size)).size).toBeGreaterThan(1);
    }

    // The word must be genuinely clickable. Each word is a group holding the drawn text plus a
    // transparent hit rectangle, so the click is aimed at the group: hit-testing the `<text>`
    // alone misses a point that lands between two glyphs.
    await page.locator('.cloud__word').first().click();
    const selection = await page.locator(EDITOR).evaluate((element) => {
      const textarea = element as HTMLTextAreaElement;
      return textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
    });
    expect(selection.length).toBeGreaterThan(0);
  });

  test('keeps the cloud out of the initial bundle', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));

    await page.goto('/');
    await setText(page, '工具 工具 汉字');
    await page.waitForTimeout(400);

    // Nothing has opened the cloud view, so its chunk must not have been fetched.
    expect(requests.filter((url) => /WordCloud/i.test(url))).toEqual([]);
  });

  test('states that segmentation is engine-dependent in the ranking', async ({ page }) => {
    /*
     * The word list genuinely differs by engine — Firefox splits 工具 into two fragments and
     * merges 对上原文 into 上原, so its counts are all 1 — and no flag can detect that, because
     * Firefox does have a Chinese dictionary, just a weaker one. The standing note is the
     * limitation statement, so it has to be there whenever a word ranking is.
     */
    await page.goto('/');
    await setText(page, '这是一个工具，这是一个小工具。');
    await page.locator('#textcount-tab-insights').click();
    await page
      .locator('[data-testid="insights-views"]')
      .getByRole('button', { name: 'Frequency' })
      .click();
    await expect(page.locator('[data-testid="insights-summary"]')).toBeVisible();

    // `degraded` keeps its narrow meaning, so it must not fire merely because engines differ.
    await expect(page.locator('[data-testid="insights-degraded"]')).toHaveCount(0);
  });

  test('opens on the cloud and orders the sub-views by how often they are used', async ({
    page,
  }) => {
    await page.goto('/');
    // English on purpose: every engine segments Latin text, while Firefox's Chinese dictionary is
    // weak enough to leave the cloud empty, which would make this a test of the segmenter.
    await setText(page, 'alpha bravo charlie delta echo foxtrot golf hotel india juliet');
    await page.locator('#textcount-tab-insights').click();

    const views = page.locator('[data-testid="insights-views"] .switcher__item');
    // Language-independent: assert the stable handle, not the translated label.
    expect(
      await views.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-view'))),
    ).toEqual(['cloud', 'frequency', 'paragraphs']);
    await expect(views.first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.cloud')).toBeVisible();
  });

  test('shows an empty state before any text is entered', async ({ page }) => {
    await page.goto('/');
    await page.locator('#textcount-tab-insights').click();
    await expect(page.locator('[data-testid="panel-insights"] .panel-empty')).toBeVisible();
    await expect(page.locator('.bars__row')).toHaveCount(0);
  });
});

test.describe('analysis list length', () => {
  /*
   * The panel used to stop at 60 paragraphs and 40 terms regardless of how much there was, so an
   * ordinary 120-paragraph report was cut in half with no way to see the rest. Everything loaded
   * is now rendered; only very long lists keep a first page and an explicit "show all".
   */
  test('shows every paragraph of an ordinary document', async ({ page }) => {
    await page.goto('/');
    const paragraphs = Array.from({ length: 150 }, (_, index) => `Paragraph ${index + 1}.`);
    await setText(page, paragraphs.join('\n\n'));
    await page.locator('#textcount-tab-insights').click();
    await page
      .locator('[data-testid="insights-views"]')
      .getByRole('button', { name: 'Paragraphs' })
      .click();

    await expect(page.locator('.bars__row')).toHaveCount(150);
    // Nothing was held back, so there is nothing to reveal.
    await expect(page.locator('[data-testid="insights-show-all"]')).toHaveCount(0);
  });

  test('can reveal every paragraph of a very long document', async ({ page }) => {
    await page.goto('/');
    const paragraphs = Array.from({ length: 400 }, (_, index) => `Paragraph ${index + 1}.`);
    await setText(page, paragraphs.join('\n\n'));
    await page.locator('#textcount-tab-insights').click();
    await page
      .locator('[data-testid="insights-views"]')
      .getByRole('button', { name: 'Paragraphs' })
      .click();

    await expect(page.locator('.bars__row')).toHaveCount(300);
    await page.locator('[data-testid="insights-show-all"]').click();
    await expect(page.locator('.bars__row')).toHaveCount(400);
  });

  test('can reveal every ranked term, not just the first page', async ({ page }) => {
    await page.goto('/');
    // 350 distinct English terms, each appearing once.
    const terms = Array.from({ length: 350 }, (_, index) => `term${index}`);
    await setText(page, terms.join(' '));
    await page.locator('#textcount-tab-insights').click();
    await page
      .locator('[data-testid="insights-views"]')
      .getByRole('button', { name: 'Frequency' })
      .click();

    await expect(page.locator('.bars__row')).toHaveCount(300);
    await page.locator('[data-testid="insights-show-all"]').click();
    await expect(page.locator('.bars__row')).toHaveCount(350);
    // Every term from the ranking is reachable, not only the first page. The order is by count
    // then term, so this is an arbitrary member rather than the last one.
    await expect(page.locator('.bars__term').filter({ hasText: /^term349$/ })).toHaveCount(1);
    await expect(page.locator('.bars__index').last()).toHaveText('350');
  });
});

test.describe('word cloud controls', () => {
  /** 70 distinct English terms, enough that the count control has something to choose between. */
  const MANY_TERMS = Array.from(
    { length: 70 },
    (_, index) => `term${String.fromCharCode(65 + (index % 26))}${index}`,
  ).join(' ');

  const openCloud = async (page: import('@playwright/test').Page): Promise<void> => {
    await page.goto('/');
    await setText(page, MANY_TERMS);
    await page.locator('#textcount-tab-insights').click();
    await page
      .locator('[data-testid="insights-views"]')
      .getByRole('button', { name: 'Cloud' })
      .click();
    await expect(page.locator('.cloud svg')).toBeVisible();
  };

  test('keeps exports disabled until the lazy canvas is ready', async ({ page }) => {
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/WordCloud-*.js', async route => { await gate; await route.continue().catch(() => {}); });
    try {
      await page.goto('/');
      await setText(page, MANY_TERMS);
      await page.locator('#textcount-tab-insights').click();
      await page.locator('[data-testid="insights-views"] [data-view="cloud"]').click();
      const buttons = page.locator('[data-testid="cloud-export"] button');
      await expect(buttons).toHaveCount(2);
      await expect(buttons.nth(0)).toBeDisabled();
      await expect(buttons.nth(1)).toBeDisabled();
      release();
      await expect(page.locator('.cloud svg')).toBeVisible();
      await expect(buttons.nth(0)).toBeEnabled();
      await expect(buttons.nth(1)).toBeEnabled();
    } finally { release(); }
  });

  for (const locale of ['zh-CN', 'en', 'ja', 'es', 'fr']) {
    test(`keeps compact controls accessible and usable with touch (${locale})`, async ({ browser, baseURL }) => {
      const context = await browser.newContext({ baseURL: baseURL!, locale, hasTouch: true, reducedMotion: 'reduce' });
      await context.addInitScript(value => localStorage.setItem('textcount.locale', value), locale);
      const page = await context.newPage();
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
        await page.goto('/');
        await setText(page, '你好。世界。再见。第四句。');
        await page.locator('#textcount-tab-symbols').click();
        await page.locator('[data-testid="symbol-group-period"] .chip').first().click();
        const nav = page.locator('.chip-nav');
        await expect(nav).toHaveCount(1);
        await expect(nav.locator('.chip-nav__position > [aria-hidden]')).toHaveText('1 / 4');
        const geometry = await nav.evaluate(element => {
          const active = document.querySelector('.chip--active, .sym--active')!.getBoundingClientRect();
          const box = element.getBoundingClientRect();
          return { gap: box.left - active.right, top: box.top - active.top,
            overflow: document.documentElement.scrollWidth > innerWidth,
            targets: [...element.querySelectorAll('button')].map(n => [n.getBoundingClientRect().width, n.getBoundingClientRect().height]) };
        });
        expect(Math.abs(geometry.gap)).toBeLessThan(1);
        expect(Math.abs(geometry.top)).toBeLessThan(1);
        expect(geometry.overflow).toBe(false);
        expect(geometry.targets.every(([w, h]) => w! >= 44 && h! >= 44)).toBe(true);
        await nav.locator('button').last().focus();
        await page.keyboard.press('Enter');
        await expect(nav.locator('.chip-nav__position')).toHaveAttribute('data-index', '2');

        await setText(page, MANY_TERMS);
        await page.locator('#textcount-tab-insights').click();
        await page.locator('[data-testid="insights-views"] [data-view="cloud"]').click();
        await expect(page.locator('.cloud svg')).toBeVisible();
        const controls = page.locator('.cloud-controls');
        const layout = await controls.evaluate(element => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          clipped: [...element.querySelectorAll('button')].some(n => n.scrollWidth > n.clientWidth + 1),
          targets: [...element.querySelectorAll('button')].map(n => [n.getBoundingClientRect().width, n.getBoundingClientRect().height]),
          motion: getComputedStyle(element.querySelector('button')!).transitionDuration,
        }));
        expect(layout.overflow).toBe(false);
        expect(layout.clipped).toBe(false);
        expect(layout.targets.every(([w, h]) => w! >= 44 && h! >= 44)).toBe(true);
        expect(layout.motion.split(',').every(value => Number.parseFloat(value) < 0.001)).toBe(true);
        await expect(controls.locator('[aria-pressed="true"]')).toHaveCount(2);
        await expect(page.locator('[data-testid="cloud-export"] [aria-pressed]')).toHaveCount(0);
        await page.keyboard.press('Tab');
        const selected = page.locator('[data-testid="cloud-count"] [aria-pressed="true"]');
        await selected.focus();
        expect(await selected.evaluate(n => getComputedStyle(n).outlineStyle)).toBe('solid');
      }
      await context.close();
    });
  }

  test('changes how many words are offered to the layout', async ({ page }) => {
    await openCloud(page);
    const count = page.locator('[data-testid="cloud-count"]');
    // The visible "placed X / Y" line only appears when words were dropped, so the numbers live on
    // the canvas container instead of in a translated sentence.
    const fit = page.locator('[data-testid="cloud-fit"]');

    /*
     * The contract is "how many candidates go to the layout", not "how many end up on screen":
     * the canvas is space-limited, so a larger count legitimately places only what fits and says
     * so in the same line. Asserting placed-count growth would test the layout engine's packing,
     * not the control.
     */
    for (const option of ['20', '30', '40', '60']) {
      await count.getByRole('button', { name: option, exact: true }).click();
      await expect(fit).toHaveAttribute('data-total', option);
      await expect(count.getByRole('button', { name: option, exact: true })).toHaveAttribute('aria-pressed', 'true');
    }

    // Never more words on screen than were offered.
    const placed = Number(await fit.getAttribute('data-placed'));
    expect(placed).toBeLessThanOrEqual(60);
    expect(await page.locator('.cloud__word').count()).toBeLessThanOrEqual(60);
  });

  test('changes the export shape, holding the aspect ratio', async ({ page }) => {
    await openCloud(page);
    const shape = page.locator('[data-testid="cloud-shape"]');
    const boxOf = async (): Promise<{ width: number; height: number }> => {
      const viewBox = await page.locator('.cloud svg').getAttribute('viewBox');
      const parts = (viewBox ?? '').split(' ').map(Number);
      return { width: parts[2] ?? 0, height: parts[3] ?? 0 };
    };

    // The shape control decides the canvas ratio, so the ratio itself is the contract.
    for (const [label, ratio] of [
      ['1:1', 1],
      ['4:3', 4 / 3],
      ['16:9', 16 / 9],
      ['16:10', 16 / 10],
    ] as const) {
      await shape.getByRole('button', { name: label, exact: true }).click();
      await expect
        .poll(async () => {
          const box = await boxOf();
          return Math.abs(box.width / box.height - ratio);
        })
        .toBeLessThan(0.02);
    }
  });

  test('shrinks the type as word count grows, so the canvas stays filled', async ({ page }) => {
    await openCloud(page);
    const count = page.locator('[data-testid="cloud-count"]');

    /*
     * Font size follows the word count, not a size control: the cloud has to fill its canvas, so
     * more words means smaller type. This asserts the Largest word's rendered size rather than the
     * drawn bounding box, because the box stays canvas-sized by design.
     */
    const largestFont = async (): Promise<number> =>
      page.evaluate(() =>
        Math.max(
          ...[...document.querySelectorAll('.cloud svg text')].map((word) =>
            Number.parseFloat(getComputedStyle(word).fontSize),
          ),
        ),
      );

    await count.getByRole('button', { name: '20', exact: true }).click();
    await expect.poll(largestFont).toBeGreaterThan(0);
    const few = await largestFont();

    await count.getByRole('button', { name: '60', exact: true }).click();
    await expect.poll(largestFont).toBeLessThan(few);

    // ...and the cloud still fills the canvas rather than shrinking to a stamp.
    const fill = await page.evaluate(() => {
      const svg = document.querySelector('.cloud svg') as SVGSVGElement;
      const words = [...svg.querySelectorAll('text')].map((word) =>
        (word as SVGGraphicsElement).getBBox(),
      );
      const top = Math.min(...words.map((box) => box.y));
      const bottom = Math.max(...words.map((box) => box.y + box.height));
      return (bottom - top) / svg.viewBox.baseVal.height;
    });
    expect(fill).toBeGreaterThan(0.6);
  });

  test('exports the cloud as SVG with the text still as text', async ({ page }) => {
    await openCloud(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-testid="cloud-export"]').getByRole('button', { name: 'SVG' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('textcount-wordcloud.svg');
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const markup = Buffer.concat(chunks).toString('utf8');
    expect(markup).toContain('<svg');
    expect(markup).toContain('xmlns="http://www.w3.org/2000/svg"');
    // Exported words are real text nodes, not an image of words.
    expect(markup).toContain('<text');
    // The live SVG inherits its ink from CSS; an export that kept currentColor would be blank.
    expect(markup).not.toContain('currentColor');
    expect(markup).toMatch(/fill="rgb\(/);
  });

  test('exports the cloud as a PNG at twice the layout size', async ({ page }) => {
    await openCloud(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-testid="cloud-export"]').getByRole('button', { name: 'PNG' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('textcount-wordcloud.png');
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const buffer = Buffer.concat(chunks);
    // PNG magic number, and a non-trivial payload rather than a blank canvas.
    expect(buffer.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(buffer.length).toBeGreaterThan(2000);
    /*
     * IHDR carries the pixel dimensions. The export targets a 3000px long edge — 300 DPI across 10
     * inches — regardless of how small the on-screen canvas is, so assert the long edge and that the
     * canvas ratio is preserved rather than pinning a scale factor.
     */
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    expect(Math.max(width, height)).toBe(3000);
    const viewBox = await page
      .locator('.cloud svg')
      .evaluate((node) => {
        const box = (node as SVGSVGElement).viewBox.baseVal;
        return { width: box.width, height: box.height };
      });
    expect(Math.abs(width / height - viewBox.width / viewBox.height)).toBeLessThan(0.02);
  });
});

test.describe('layout stability', () => {
  test('aligns the workspace toolbar dividers with a mouse and touch pointer', async ({ browser, baseURL }) => {
    for (const touch of [false, true]) {
      const context = await browser.newContext({ hasTouch: touch, baseURL: baseURL! });
      const page = await context.newPage();
      for (const viewport of [{ width: 1440, height: 900 }, { width: 844, height: 390 }]) {
        await page.setViewportSize(viewport);
        await page.goto('/');
        for (const tool of ['stats', 'search', 'symbols', 'insights']) {
          await page.locator(`#textcount-tab-${tool}`).click();
          const geometry = await page.evaluate(() => {
            const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
            const left = rect('.editor__head');
            const right = rect('.tools__head');
            const tabs = rect('.tools__head .switcher');
            const editor = rect('.editor');
            const tools = rect('.tools');
            return { left: left.bottom, right: right.bottom, difference: tools.left - editor.right,
              clipped: tabs.top < right.top || tabs.bottom > right.bottom };
          });
          expect(Math.abs(geometry.left - geometry.right)).toBeLessThan(0.5);
          expect(Math.abs(geometry.difference)).toBeLessThan(0.5);
          expect(geometry.clipped).toBe(false);
        }
      }
      await context.close();
    }
  });
  const SMALL = '你好。世界。\n\nSecond paragraph.';

  test('keeps the panel viewport stable while scrollbars appear and tabs change', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 760 });
    await page.goto('/');
    await setText(page, '检查（示例）与 (test)：冒号:，逗号,；分号;。句点. !！?？'.repeat(40));
    const frames = await page.evaluate(async () => {
      const widths: number[] = [];
      const editor = document.querySelector('textarea')!;
      const positions: number[] = [];
      for (const tool of ['symbols', 'search', 'insights', 'stats', 'symbols']) {
        (document.querySelector(`#textcount-tab-${tool}`) as HTMLButtonElement).click();
        for (let frame = 0; frame < 20; frame++) {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          widths.push(document.querySelector('.tools__panel')!.clientWidth);
          positions.push(editor.getBoundingClientRect().width);
        }
      }
      return { widths, positions };
    });
    expect(new Set(frames.widths).size).toBe(1);
    expect(new Set(frames.positions).size).toBe(1);
    await expect(page.locator('.editor__note')).toHaveCount(0);
  });

  /*
   * The editor must not move when a side panel is opened. It used to: the insights tool took a
   * 440px column against everyone else's 348px, so switching to it narrowed the editor by 92px and
   * re-wrapped the whole document under the reader's eyes.
   */
  test('keeps the editor geometry identical on every tool', async ({ page }) => {
    await page.goto('/');
    await setText(page, SMALL);
    const seen: string[] = [];
    for (const tool of ['stats', 'search', 'symbols', 'insights']) {
      await page.locator(`#textcount-tab-${tool}`).click();
      await page.waitForTimeout(400);
      const geometry = await page.locator(EDITOR).evaluate((element) => {
        const box = element.getBoundingClientRect();
        return `${Math.round(box.x)}/${Math.round(box.width)}`;
      });
      seen.push(geometry);
    }
    expect(new Set(seen).size).toBe(1);
  });

  /*
   * A clipped tab hides the navigation itself. `Punctuation` measured 94px in an 87px tab at 390px
   * and was rendering as `Punctuat…`; no horizontal overflow was reported anywhere, which is why
   * "the page does not scroll sideways" is not evidence that a responsive layout works.
   */
  for (const locale of ['zh-CN', 'en', 'ja', 'es', 'fr'] as const) {
    test(`fits every tool tab on phones and short landscape screens (${locale})`, async ({ page }) => {
      for (const width of [320, 390, 640, 844]) {
        await page.setViewportSize({ width, height: width >= 600 ? 390 : 720 });
        await page.goto('/');
        await page.evaluate((value) => localStorage.setItem('textcount.locale', value), locale);
        await page.reload();
        await page.waitForSelector(EDITOR);

        const clipped = await page.locator('.switcher__item').evaluateAll((nodes) =>
          nodes
            .filter((node) => node.scrollWidth > node.clientWidth + 1)
            .map((node) => `${node.textContent} (${node.scrollWidth}>${node.clientWidth})`),
        );
        expect(clipped, `clipped tabs at ${width}px in ${locale}`).toEqual([]);
      }
    });
  }

  /*
   * The rule value says which rule the headline number was counted under, so it must never be
   * shortened. It used to carry `overflow: hidden` and an ellipsis.
   */
  test('shows the complete counting definition on demand', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    await page.locator('#textcount-tab-stats').click();
    await page.locator('.rule-trigger').click();
    const value = page.locator('.rules__explain');
    await expect(value).not.toBeVisible();
    const definition = page.locator('.rules__details > summary');
    await expect(definition).toBeVisible();
    await definition.focus();
    await expect(definition).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(value).toBeVisible();
    await page.locator('input[value="han"]').check();
    await expect(value).toContainText('Unicode');
    const clipped = await value.evaluate((node) => node.scrollWidth > node.clientWidth + 1);
    expect(clipped).toBe(false);
    await expect(value).toHaveText(/\S/);
  });

  test('distributes summary figures and analysis views evenly', async ({ page }) => {
    for (const width of [390, 844, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      const centers = await page.locator('.stats').evaluate((node) => {
        const box = node.getBoundingClientRect();
        return [...node.querySelectorAll('.stats__value')].map(value => {
          const rect = value.getBoundingClientRect();
          return (rect.left + rect.width / 2 - box.left) / box.width;
        });
      });
      for (let i = 0; i < 3; i++) expect(centers[i]).toBeCloseTo((i + 0.5) / 3, 2);
      await page.locator('#textcount-tab-insights').click();
      const widths = await page.locator('[data-testid="insights-views"] button').evaluateAll(
        nodes => nodes.map(node => node.getBoundingClientRect().width),
      );
      expect(widths).toHaveLength(3);
      expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(1);
    }
  });

  /* A seven-digit count is nine characters once the thousands separators are in. */
  test('renders a seven-digit count without overflow', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    // 80,000 repetitions is 1,360,000 characters, so the slice really does reach 1,234,567.
    await setText(page, '这是一个用于验证七位数排版的句子。'.repeat(80_000).slice(0, 1_234_567));
    await expect(page.locator('.stats__value').first()).toHaveText(/^\d,\d{3},\d{3}$/);
    await expect
      .poll(async () =>
        page.locator('.stats__value').evaluateAll((nodes) =>
          nodes.every((node) => node.scrollWidth <= node.clientWidth + 1),
        ),
      )
      .toBe(true);
    // Nothing may spill sideways, however the group chooses to arrange itself.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});

test.describe('responsive layout', () => {
  const VIEWPORTS = [
    { name: 'small phone', width: 320, height: 568 },
    { name: 'phone', width: 390, height: 844 },
    { name: 'phone landscape', width: 844, height: 390 },
    { name: 'small phone landscape', width: 640, height: 360 },
    { name: 'tablet portrait', width: 834, height: 1194 },
    { name: 'tablet landscape', width: 1024, height: 768 },
    { name: 'laptop', width: 1366, height: 768 },
    { name: 'desktop', width: 1920, height: 1080 },
    { name: '2K desktop', width: 2560, height: 1440 },
    { name: 'scaled 2K desktop', width: 1707, height: 960 },
    { name: 'ultrawide desktop', width: 3440, height: 1440 },
    { name: '4K desktop', width: 3840, height: 2160 },
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
          app: rect('.app')!,
          workspace: rect('.workspace')!,
          inputFontSize: Number.parseFloat(getComputedStyle(document.querySelector('textarea')!).fontSize),
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
      // Equal sizes keep the three figures balanced; weight and color identify the primary count.
      expect(layout.primaryFontSize).toBe(layout.secondaryFontSize);
      // The header must not eat the screen on a small phone.
      expect(layout.toolbar.height).toBeLessThan(viewport.height * 0.25);
      if (viewport.width >= 1200) {
        // "No overflow" also passed when a 1520×920 island floated in the middle of a 2K display.
        expect(layout.app.top).toBeLessThan(1);
        expect(Math.abs(layout.app.height - viewport.height)).toBeLessThan(1);
        expect(layout.workspace.width / viewport.width).toBeGreaterThan(0.9);
        expect(viewport.height - layout.workspace.bottom).toBeLessThanOrEqual(65);
        expect(layout.workspace.height / viewport.height).toBeGreaterThan(0.7);
        expect(layout.inputFontSize).toBeGreaterThanOrEqual(16);
        expect(layout.inputFontSize).toBeLessThanOrEqual(18);
        expect(layout.primaryFontSize).toBeLessThanOrEqual(32);
      }
    });
  }
});
