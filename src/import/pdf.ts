import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { checkedText, DocumentError, MAX_TEXT_LENGTH, throwIfAborted, type ImportProgress } from './format';

GlobalWorkerOptions.workerSrc = workerUrl;

export async function extractPdf(file: File, signal: AbortSignal, progress: (value: ImportProgress) => void): Promise<string> {
  throwIfAborted(signal);
  const bytes = new Uint8Array(await file.arrayBuffer());
  throwIfAborted(signal);
  const assets = new URL(`${import.meta.env.BASE_URL}pdf-assets/`, location.origin).href;
  const task = getDocument({
    data: bytes,
    cMapUrl: `${assets}cmaps/`, cMapPacked: true,
    standardFontDataUrl: `${assets}standard_fonts/`,
    useWorkerFetch: true, useWasm: false, isEvalSupported: false,
    disableFontFace: true, useSystemFonts: false,
    isOffscreenCanvasSupported: false, isImageDecoderSupported: false,
    // A malformed page must fail the import rather than silently return partial statistics.
    stopAtErrors: true,
  });
  const abort = () => { void task.destroy().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  let passwordRequired = false;
  task.onPassword = () => { passwordRequired = true; abort(); };
  try {
    const document = await task.promise;
    const pages: string[] = [];
    let totalLength = 0;
    for (let index = 1; index <= document.numPages; index++) {
      throwIfAborted(signal);
      const page = await document.getPage(index);
      const content = await page.getTextContent();
      const lines: string[] = [];
      let previous: { right: number; y: number; height: number } | undefined;
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const x = item.transform[4] as number;
        const y = item.transform[5] as number;
        if (previous && item.str) {
          const newLine = Math.abs(y - previous.y) > Math.max(previous.height * 0.5, 2);
          const gap = x - previous.right;
          if (newLine && !lines.at(-1)?.endsWith('\n')) lines.push('\n');
          else if (!newLine && gap > Math.max(item.height * 0.15, 1) && !/\s$/.test(lines.at(-1) ?? '') && !/^\s/.test(item.str)) lines.push(' ');
        }
        lines.push(item.str);
        if (item.hasEOL) lines.push('\n');
        previous = { right: x + item.width, y, height: item.height };
      }
      const text = lines.join('').replace(/\n$/, '');
      totalLength += text.length + 2;
      if (totalLength > MAX_TEXT_LENGTH) throw new DocumentError('tooLarge');
      pages.push(text);
      progress({ page: index, total: document.numPages });
      page.cleanup();
    }
    return checkedText(pages.join('\n\n'));
  } catch (error) {
    throwIfAborted(signal);
    if (passwordRequired) throw new DocumentError('encrypted');
    if (error instanceof DocumentError) throw error;
    throw new DocumentError('invalid');
  } finally {
    signal.removeEventListener('abort', abort);
    await task.destroy();
  }
}
