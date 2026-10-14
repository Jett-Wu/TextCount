/**
 * The bridge between the tool panels and the native `<textarea>`.
 *
 * The textarea is uncontrolled: Preact never writes to its `value`, which is what keeps IME
 * composition, undo history, caret position and selection intact on a large document. Panels
 * that need to reveal a match therefore talk to the element through this module rather than
 * through reactive state.
 */

import { findMatches } from '../core/search';
import { getText } from './state';

let editor: HTMLTextAreaElement | null = null;

export function registerEditor(element: HTMLTextAreaElement | null): void {
  editor = element;
}

/**
 * Puts `offset` near the middle of the visible area. `scrollHeight` cannot answer "where is
 * character N", so this counts the logical line the offset sits on and multiplies by the
 * measured line height. Wrapped lines make it approximate; the caret placed by
 * `setSelectionRange` is the authoritative indicator.
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
  if (Number.isFinite(centred)) element.scrollTop = Math.max(0, centred);
}

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

/** Selects the first literal occurrence of `term`. */
export function locateFirst(term: string, caseSensitive = true): boolean {
  if (term.length === 0) return false;
  const result = findMatches(getText(), term, { caseSensitive, maxPositions: 1 });
  const start = result.positions[0];
  if (start === undefined) return false;
  return revealRange(start, start + (result.lengths[0] ?? term.length));
}

export async function copyAllText(): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText !== undefined) {
      await navigator.clipboard.writeText(getText());
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
