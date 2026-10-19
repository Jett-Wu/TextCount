export type DocumentKind = 'pdf' | 'docx' | 'doc';
export type ImportFailure = 'unsupported' | 'tooLarge' | 'invalid' | 'encrypted' | 'empty' | 'timeout' | 'cancelled';
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_TEXT_LENGTH = 10_000_000;
export const MAX_XML_BYTES = 40 * 1024 * 1024;

export class DocumentError extends Error {
  constructor(public readonly code: ImportFailure) { super(code); }
}

export interface ImportProgress { page: number; total: number }
export type ImportReply = { text: string } | { error: ImportFailure };

export function documentKind(name: string, size: number): DocumentKind {
  const extension = name.split('.').at(-1)?.toLowerCase();
  if (extension !== 'pdf' && extension !== 'docx' && extension !== 'doc') throw new DocumentError('unsupported');
  if (size > MAX_FILE_BYTES) throw new DocumentError('tooLarge');
  if (size === 0) throw new DocumentError('empty');
  return extension;
}

export function checkedText(text: string): string {
  if (text.length > MAX_TEXT_LENGTH) throw new DocumentError('tooLarge');
  if (!text.trim()) throw new DocumentError('empty');
  return text;
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DocumentError('cancelled');
}

