/**
 * Literal search over the original text.
 *
 * - Matching is literal: `,` never matches `，`.
 * - Matching is non-overlapping: `aa` occurs twice in `aaaa`.
 * - The count is always exact; only a bounded number of positions is retained, so a
 *   million-match document cannot allocate a million-element array.
 * - Offsets are UTF-16 code units, ready for `setSelectionRange`.
 * - The text is never modified.
 *
 * The case-insensitive path deliberately does not lower-case a copy of the text:
 * `toLowerCase()` can change a string's length, which would shift every offset after it and
 * highlight the wrong characters. A case-insensitive RegExp runs against the original string,
 * so `match.index` is already a correct original offset.
 */

export const DEFAULT_MAX_POSITIONS = 500;

export interface SearchOptions {
  caseSensitive?: boolean;
  maxPositions?: number;
}

export interface MatchResult {
  term: string;
  count: number;
  positions: number[];
  lengths: number[];
  truncated: boolean;
}

const EMPTY_MATCH: Omit<MatchResult, 'term'> = {
  count: 0,
  positions: [],
  lengths: [],
  truncated: false,
};

function escapeRegExp(literal: string): string {
  return literal.replace(/[\\^$.*+?()[\]{}|/\-#&~]/g, '\\$&');
}

function buildCaseInsensitivePattern(term: string): RegExp {
  const source = escapeRegExp(term);
  try {
    return new RegExp(source, 'giu');
  } catch {
    // A lone surrogate in the term makes the `u` flag throw.
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
      if (match[0].length === 0) pattern.lastIndex++;
    }
  }

  return { term, count, positions, lengths, truncated: count > positions.length };
}

export function findMatchesMany(
  text: string,
  terms: readonly string[],
  options: SearchOptions = {},
): MatchResult[] {
  return terms.map((term) => findMatches(text, term, options));
}

function alignDown(text: string, index: number): number {
  if (index <= 0) return 0;
  if (index >= text.length) return text.length;
  const unit = text.charCodeAt(index);
  if (unit >= 0xdc00 && unit <= 0xdfff) return index - 1;
  return index;
}

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
  truncatedBefore: boolean;
  truncatedAfter: boolean;
}

/** Excerpt around a match. Slices are aligned to code points so they never emit half an emoji. */
export function contextAround(
  text: string,
  start: number,
  length: number,
  radius = 80,
): MatchContext {
  const clampedStart = Math.max(0, Math.min(start, text.length));
  const clampedEnd = Math.max(clampedStart, Math.min(clampedStart + length, text.length));
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
