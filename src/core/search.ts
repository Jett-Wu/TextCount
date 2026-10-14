/**
 * Literal search over the original text.
 *
 * Design rules (see the product spec, section 3.2):
 *  - Matching is **literal and contiguous**: `,` never matches `，`.
 *  - Matching is **non-overlapping**: `aa` occurs twice in `aaaa`.
 *  - The full match count is always exact, no matter how many matches there are.
 *  - Only a bounded number of positions is retained, so a one-million-match document cannot
 *    allocate a one-million-element array. `truncated` tells the caller when that happened.
 *  - Offsets are UTF-16 code units so they can be handed straight to `setSelectionRange`.
 *  - The original text is never modified.
 *
 * The case-insensitive path deliberately does **not** build a lower-cased copy of the text:
 * `toLowerCase()` can change string length for some code points, which would shift every
 * offset after it and highlight the wrong characters. Instead a case-insensitive RegExp is
 * executed against the original string, so `match.index` is already a correct original offset.
 */

/** Default cap on retained match positions per term. */
export const DEFAULT_MAX_POSITIONS = 500;

export interface SearchOptions {
  /** Exact literal matching (default) or case-insensitive matching. */
  caseSensitive?: boolean;
  /** Maximum number of positions to retain. The count is unaffected. */
  maxPositions?: number;
}

export interface MatchResult {
  term: string;
  /** Exact number of non-overlapping matches in the whole text. */
  count: number;
  /** UTF-16 offsets of the retained matches, ascending. */
  positions: number[];
  /** Length in UTF-16 code units of each retained match (parallel to `positions`). */
  lengths: number[];
  /** True when `positions` holds fewer entries than `count`. */
  truncated: boolean;
}

const EMPTY_MATCH: Omit<MatchResult, 'term'> = {
  count: 0,
  positions: [],
  lengths: [],
  truncated: false,
};

/** Escapes a literal for use inside a RegExp, including the `u`-mode reserved characters. */
export function escapeRegExp(literal: string): string {
  return literal.replace(/[\\^$.*+?()[\]{}|/\-#&~]/g, '\\$&');
}

function buildCaseInsensitivePattern(term: string): RegExp {
  const source = escapeRegExp(term);
  try {
    return new RegExp(source, 'giu');
  } catch {
    // A lone surrogate in the term makes the `u` flag throw; plain `gi` still works.
    return new RegExp(source, 'gi');
  }
}

export function findMatches(text: string, term: string, options: SearchOptions = {}): MatchResult {
  const caseSensitive = options.caseSensitive ?? true;
  const maxPositions = Math.max(0, options.maxPositions ?? DEFAULT_MAX_POSITIONS);

  if (term.length === 0 || text.length === 0 || text.length < term.length) {
    return { term, ...EMPTY_MATCH };
  }

  const positions: number[] = [];
  const lengths: number[] = [];
  let count = 0;

  if (caseSensitive) {
    let from = 0;
    for (;;) {
      const index = text.indexOf(term, from);
      if (index === -1) break;
      count++;
      if (positions.length < maxPositions) {
        positions.push(index);
        lengths.push(term.length);
      }
      from = index + term.length;
    }
  } else {
    const pattern = buildCaseInsensitivePattern(term);
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      count++;
      if (positions.length < maxPositions) {
        positions.push(match.index);
        lengths.push(match[0].length);
      }
      // `exec` already advanced past a non-empty match; guard against a zero-length match
      // (possible for a term that folds to nothing) so the loop cannot spin forever.
      if (match[0].length === 0) pattern.lastIndex++;
    }
  }

  return { term, count, positions, lengths, truncated: count > positions.length };
}

/** Runs `findMatches` for several terms. Empty/blank terms are skipped by the caller. */
export function findMatchesMany(
  text: string,
  terms: readonly string[],
  options: SearchOptions = {},
): MatchResult[] {
  return terms.map((term) => findMatches(text, term, options));
}

/** Moves an offset down when it would split a surrogate pair. */
function alignDown(text: string, index: number): number {
  if (index <= 0) return 0;
  if (index >= text.length) return text.length;
  const unit = text.charCodeAt(index);
  if (unit >= 0xdc00 && unit <= 0xdfff) return index - 1;
  return index;
}

/** Moves an offset up when it would split a surrogate pair. */
function alignUp(text: string, index: number): number {
  if (index <= 0) return 0;
  if (index >= text.length) return text.length;
  const unit = text.charCodeAt(index - 1);
  if (unit >= 0xd800 && unit <= 0xdbff) return index + 1;
  return index;
}

export interface MatchContext {
  start: number;
  end: number;
  before: string;
  match: string;
  after: string;
  /** True when the excerpt does not reach the beginning/end of the document. */
  truncatedBefore: boolean;
  truncatedAfter: boolean;
}

/**
 * Builds a short excerpt around a match for the "show context" view. Slices are aligned to
 * code point boundaries so an excerpt never starts or ends with half an emoji.
 */
export function contextAround(
  text: string,
  start: number,
  length: number,
  radius = 80,
): MatchContext {
  const clampedStart = Math.max(0, Math.min(start, text.length));
  const clampedEnd = Math.max(clampedStart, Math.min(clampedStart + length, text.length));
  // Align the match itself as well as the excerpt: a caller that passes an offset inside a
  // surrogate pair (for example from an external index) must not get half an emoji back.
  const safeStart = alignDown(text, clampedStart);
  const safeEnd = Math.max(safeStart, alignUp(text, clampedEnd));
  const from = alignDown(text, Math.max(0, safeStart - radius));
  const to = Math.max(safeEnd, alignUp(text, Math.min(text.length, safeEnd + radius)));
  return {
    start: safeStart,
    end: safeEnd,
    before: text.slice(from, safeStart),
    match: text.slice(safeStart, safeEnd),
    after: text.slice(safeEnd, to),
    truncatedBefore: from > 0,
    truncatedAfter: to < text.length,
  };
}
