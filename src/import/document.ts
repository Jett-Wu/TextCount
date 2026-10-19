import { checkedText, documentKind, DocumentError, throwIfAborted, type DocumentKind, type ImportFailure, type ImportProgress, type ImportReply } from './format';

/** A separate worker can be terminated even while a damaged archive is being decoded. */
function importWord(file: File, kind: 'doc' | 'docx', signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal);
    const worker = new Worker(new URL('../workers/document.worker.ts', import.meta.url), { type: 'module' });
    const finish = (text?: string, error?: ImportFailure) => {
      worker.terminate();
      signal.removeEventListener('abort', abort);
      if (error) reject(new DocumentError(error));
      else resolve(text!);
    };
    const abort = () => finish(undefined, 'cancelled');
    signal.addEventListener('abort', abort, { once: true });
    worker.onmessage = (event: MessageEvent<ImportReply>) => {
      if ('error' in event.data) finish(undefined, event.data.error);
      else finish(event.data.text);
    };
    worker.onerror = () => finish(undefined, 'invalid');
    worker.onmessageerror = () => finish(undefined, 'invalid');
    worker.postMessage({ file, kind });
  });
}

export async function importDocument(file: File, signal: AbortSignal, progress: (value: ImportProgress) => void): Promise<{ text: string; kind: DocumentKind }> {
  const kind = documentKind(file.name, file.size);
  throwIfAborted(signal);
  const text = kind === 'pdf'
    ? await (await import('./pdf')).extractPdf(file, signal, progress)
    : await importWord(file, kind, signal);
  throwIfAborted(signal);
  return { text: checkedText(text), kind };
}
