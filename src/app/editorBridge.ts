/**
 * The bridge between the tool panels and the native `<textarea>`.
 *
 * The textarea is intentionally uncontrolled: Preact never writes to its `value`, which is what
 * keeps IME composition, undo history, caret position and selection intact on a large document.
 * Panels that need to reveal a match therefore talk to the element through this small module
 * instead of through reactive state.
 */
import { getText } from './appState';

let editor: HTMLTextAreaElement | null = null;

export function registerEditor(element: HTMLTextAreaElement | null): void {
  editor = element;
}

export function getEditor(): HTMLTextAreaElement | null {
  return editor;
}

/**
 * Estimates the scroll offset that puts `offset` near the middle of the visible area.
 *
 * `scrollHeight` cannot be asked for "where is character N", so this counts the logical line the
 * offset sits on and multiplies by the measured line height. Wrapped long lines make the estimate
 * approximate; the caret that `setSelectionRange` places is the authoritative indicator, and the
 * browser's own scroll-into-view still applies on top of it.
 */
function scrollOffsetIntoView(element: HTMLTextAreaElement, offset: number): void {
  const value = element.value;
  let line = 0;
  for (let i = 0; i < offset && i < value.length; i++) {
    if (value.charCodeAt(i) === 10) line++;
  }
  const styles = getComputedStyle(element);
  const fontSize = Number.parseFloat(styles.fontSize);
  const lineHeight = Number.parseFloat(styles.lineHeight);
  const resolvedLineHeight = Number.isFinite(lineHeight) ? lineHeight : fontSize * 1.7;
  const paddingTop = Number.parseFloat(styles.paddingTop);
  const centred =
    (Number.isFinite(paddingTop) ? paddingTop : 0) +
    line * resolvedLineHeight -
    element.clientHeight / 2 +
    resolvedLineHeight / 2;
  if (Number.isFinite(centred)) {
    element.scrollTop = Math.max(0, centred);
  }
}

/** Selects `[start, end)` in the editor, focuses it and scrolls it into view. */
export function revealRange(start: number, end: number): boolean {
  const element = editor;
  if (element === null) return false;
  const limit = element.value.length;
  const safeStart = Math.max(0, Math.min(start, limit));
  const safeEnd = Math.max(safeStart, Math.min(end, limit));

  element.focus({ preventScroll: true });
  element.setSelectionRange(safeStart, safeEnd);
  scrollOffsetIntoView(element, safeStart);
  return true;
}

/** Copies the whole document. Returns false when the clipboard is unavailable. */
export async function copyAllText(): Promise<boolean> {
  const text = getText();
  try {
    if (navigator.clipboard?.writeText !== undefined) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  const element = editor;
  if (element === null) return false;
  try {
    element.focus({ preventScroll: true });
    element.select();
    const copied = document.execCommand('copy');
    element.setSelectionRange(0, 0);
    element.scrollTop = 0;
    return copied;
  } catch {
    return false;
  }
}
