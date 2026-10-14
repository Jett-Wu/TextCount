/**
 * Shared navigation helper: reveal a piece of text in the editor.
 *
 * Search results and symbol entries both need "show me where this is", and both must be able to
 * do it without keeping their own copy of the document.
 */
import { getText } from './appState';
import { revealRange } from './editorBridge';
import { findMatches } from '../core/search';

/** Selects the first literal occurrence of `term` in the document. */
export function locateFirst(term: string, caseSensitive = true): boolean {
  if (term.length === 0) return false;
  const text = getText();
  const result = findMatches(text, term, { caseSensitive, maxPositions: 1 });
  const start = result.positions[0];
  if (start === undefined) return false;
  const length = result.lengths[0] ?? term.length;
  return revealRange(start, start + length);
}
