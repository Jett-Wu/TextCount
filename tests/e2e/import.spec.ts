import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { strToU8, zipSync } from 'fflate';

const input = '[data-testid="document-file"]';
const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/import/${name}`, import.meta.url));
const editor = '#textcount-editor';

async function fill(page: Page, text: string) {
  await page.locator(editor).fill(text);
}

test.describe('local document import', () => {
  for (const multiline of [true, false]) for (const replacement of [false, true]) {
    test(`million-character ${multiline ? 'multiline' : 'single-line'} ${replacement ? 'replacement' : 'first import'} preserves text, caret and subsequent edits`, async ({ page }, testInfo) => {
      const text = (multiline ? '你好 TextCount 2026。\n' : '你好 TextCount 2026。 ').repeat(60_000).slice(0, 1_000_000);
      const buffer = Buffer.from(zipSync({ 'word/document.xml': strToU8(
        `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
      ) }));
      await page.goto('./');
      if (replacement) {
        await fill(page, 'Old line\n'.repeat(1000));
        await page.locator(editor).evaluate(element => { element.scrollTop = element.scrollHeight; });
      }
      await page.locator(editor).evaluate(element => {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!;
        Object.defineProperty(element, 'value', {
          configurable: true,
          get() { return descriptor.get!.call(this); },
          set(value: string) {
            const started = performance.now();
            descriptor.set!.call(this, value);
            // Measure the entire write turn, including any synchronous layout after the setter.
            queueMicrotask(() => { element.setAttribute('data-write-ms', String(performance.now() - started)); });
          },
        });
      });
      await page.locator(input).setInputFiles({ name: 'million.docx', mimeType: 'application/zip', buffer });
      if (replacement) {
        await expect(page.locator('.import-notice[role="dialog"]')).toBeVisible();
        await page.getByRole('button', { name: 'Replace text', exact: true }).click();
      }
      await expect(page.locator('.stats__value').nth(1)).toHaveText('1,000,000', { timeout: 30_000 });
      const result = await page.locator(editor).evaluate(element => {
        const area = element as HTMLTextAreaElement;
        return { length: area.value.length, start: area.selectionStart, end: area.selectionEnd,
          top: area.scrollTop, left: area.scrollLeft, writeMs: Number(area.dataset['writeMs']) };
      });
      expect(result).toMatchObject({ length: 1_000_000, start: 0, end: 0, top: 0, left: 0 });
      expect(await page.locator(editor).evaluate((element, expected) => (element as HTMLTextAreaElement).value === expected, text)).toBe(true);
      await expect(page.locator(editor)).toBeFocused();
      await testInfo.attach('write-turn-ms', { body: JSON.stringify(result), contentType: 'application/json' });
      // Native setters can force layout when replacing edited text; this budget covers the empty editor only.
      // It does not claim that the browser paints a million characters in 150ms.
      if (!replacement) expect(result.writeMs).toBeLessThan(150);
      await page.keyboard.type('X');
      await expect(page.locator('.stats__value').nth(1)).toHaveText('1,000,001', { timeout: 30_000 });
      expect(await page.locator(editor).evaluate(element => (element as HTMLTextAreaElement).value.startsWith('X你好'))).toBe(true);
    });
  }

  test('dismisses completed notices without taking focus away from the document', async ({ page }) => {
    await page.goto('./');
    await page.locator(input).setInputFiles(fixture('simple.doc'));
    await expect(page.locator(editor)).not.toHaveValue('');
    await expect(page.locator('.import-notice')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.import-notice')).toHaveCount(0);
    await expect(page.locator(editor)).toBeFocused();
    await page.locator(input).setInputFiles({ name: 'bad.docx', mimeType: 'application/zip', buffer: Buffer.from('bad') });
    await expect(page.locator('.import-notice')).toContainText('damaged');
    await page.locator(editor).click();
    await expect(page.locator('.import-notice')).toHaveCount(0);
    await expect(page.locator(editor)).toBeFocused();
    await expect(page.locator(editor)).toHaveValue('This is a simple file created with Word 97-SR2.');
  });
  test('does not load a parser until a file is selected', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', request => requests.push(request.url()));
    await page.goto('./');
    await expect(page.locator('[data-control="import"]')).toBeVisible();
    await fill(page, 'No file selected.');
    expect(requests.filter(url => /document\.worker|pdf\.worker|\/pdf-|\/pdf-assets\//.test(url))).toEqual([]);
  });

  for (const [name, expected] of [
    ['simple.doc', 'This is a simple file created with Word 97-SR2.'],
    ['mixed.docx', '你好 TextCount 2026\n甲\tBeta\n<script>alert(1)</script>'],
    ['text.pdf', 'Hello PDF 2026\n\nSecond page.'],
    ['chinese.pdf', '你好，世界。'],
  ] as const) {
    test(`extracts ${name} locally and analyzes the complete text`, async ({ page }) => {
      const requests: { url: string; method: string; body: string | null }[] = [];
      const errors: string[] = [];
      page.on('request', r => requests.push({ url: r.url(), method: r.method(), body: r.postData() }));
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('./');
      await page.locator(input).setInputFiles(fixture(name));
      await expect(page.locator(editor)).toHaveValue(expected);
      await expect(page.locator('.stats__value').nth(1)).toHaveText(new Intl.NumberFormat('en-US').format([...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(expected)].length));
      expect(errors).toEqual([]);
      // WebKit exposes File.arrayBuffer() as a local blob read; it is not an HTTP upload.
      expect(requests.filter(r => !r.url.startsWith('http://127.0.0.1:4173/TextCount/')
        && !(r.url.startsWith('blob:') && new URL(r.url).origin === 'http://127.0.0.1:4173'))).toEqual([]);
      expect(requests.every(r => r.method === 'GET' && r.body === null)).toBe(true);
      expect(await page.evaluate(() => Object.values(localStorage).some(value => value.includes('Hello PDF') || value.includes('TextCount 2026')))).toBe(false);
      await page.reload();
      await expect(page.locator(editor)).toHaveValue('');
    });
  }

  test('requires confirmation and preserves the original on cancel or error', async ({ page }) => {
    await page.goto('./');
    await fill(page, 'Keep my text.');
    await page.locator(input).setInputFiles(fixture('simple.doc'));
    const dialog = page.locator('.import-notice[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(page.locator(editor)).toHaveValue('Keep my text.');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page.locator(input).setInputFiles({ name: 'broken.docx', mimeType: 'application/zip', buffer: Buffer.from('invalid') });
    await expect(page.locator('.import-notice')).toContainText('damaged');
    await expect(page.locator(editor)).toHaveValue('Keep my text.');
    await page.locator(input).setInputFiles(fixture('simple.doc'));
    await dialog.getByRole('button', { name: 'Replace text', exact: true }).click();
    await expect(page.locator(editor)).toHaveValue('This is a simple file created with Word 97-SR2.');
  });

  for (const name of ['no-text.pdf', 'encrypted.pdf', 'PasswordProtected.doc']) {
    test(`rejects ${name} without replacing any text`, async ({ page }) => {
      await page.goto('./');
      await fill(page, 'Keep this.');
      await page.locator(input).setInputFiles(fixture(name));
      await expect(page.locator('.import-notice')).toContainText(name === 'no-text.pdf' ? 'No extractable text' : 'password');
      await expect(page.locator(editor)).toHaveValue('Keep this.');
    });
  }

  test('cancels pending work and never overwrites text entered while extracting', async ({ page }) => {
    await page.goto('./');
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/document.worker-*.js', async route => { await gate; await route.continue().catch(() => {}); });
    await page.locator(input).setInputFiles(fixture('simple.doc'));
    await expect(page.locator('.import-notice')).toContainText('Extracting');
    await fill(page, 'Typed during import.');
    release();
    const dialog = page.locator('.import-notice[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(page.locator(editor)).toHaveValue('Typed during import.');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.unroute('**/document.worker-*.js');
    let releaseAgain: () => void = () => {};
    const again = new Promise<void>(resolve => { releaseAgain = resolve; });
    await page.route('**/document.worker-*.js', async route => { await again; await route.continue().catch(() => {}); });
    await page.locator(input).setInputFiles(fixture('simple.doc'));
    await page.locator('.import-notice').getByRole('button', { name: 'Cancel', exact: true }).click();
    releaseAgain();
    await expect(page.locator('.import-notice')).toHaveCount(0);
    await expect(page.locator(editor)).toHaveValue('Typed during import.');
  });

  test('keeps import messages inside a narrow screen and preserves editor geometry', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('./');
    const before = await page.locator(editor).boundingBox();
    await page.locator(input).setInputFiles(fixture('mixed.docx'));
    await expect(page.locator(editor)).not.toHaveValue('');
    const notice = await page.locator('.import-notice').boundingBox();
    expect(notice!.x).toBeGreaterThanOrEqual(0);
    expect(notice!.x + notice!.width).toBeLessThanOrEqual(320);
    expect(await page.locator(editor).boundingBox()).toEqual(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test('reports unsupported files without starting a parser', async ({ page }) => {
    await page.goto('./');
    await fill(page, 'Keep this.');
    await page.locator(input).setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('notes') });
    await expect(page.locator('.import-notice')).toContainText('Choose a text PDF');
    await expect(page.locator(editor)).toHaveValue('Keep this.');
  });

  test('reports a timeout and releases a stalled Word worker', async ({ page }) => {
    await page.clock.install();
    await page.goto('./');
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/document.worker-*.js', async route => { await gate; await route.continue().catch(() => {}); });
    await page.locator(input).setInputFiles(fixture('simple.doc'));
    await expect(page.locator('.import-notice')).toContainText('Extracting');
    await page.clock.fastForward(120_001);
    await expect(page.locator('.import-notice')).toContainText('timed out');
    release();
    await expect(page.locator(editor)).toHaveValue('');
  });

  test('cancels a PDF while its lazy module is loading', async ({ page }) => {
    await page.goto('./');
    await fill(page, 'Original');
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/pdf-*.js', async route => { await gate; await route.continue().catch(() => {}); });
    await page.locator(input).setInputFiles(fixture('text.pdf'));
    await expect(page.locator('.import-notice')).toContainText('Extracting');
    await page.locator('.import-notice').getByRole('button', { name: 'Cancel', exact: true }).click();
    release();
    await expect(page.locator('.import-notice')).toHaveCount(0);
    await expect(page.locator(editor)).toHaveValue('Original');
  });
});
