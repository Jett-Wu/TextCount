/**
 * Unicode helpers for the TextCount engine.
 *
 * Everything in this file is a pure function with no DOM dependency so that it can run in the
 * main thread, in a Web Worker and in Node (unit tests) with identical results.
 *
 * Two different "lengths" appear throughout the project and must never be confused:
 *  - **code points** (and UTF-16 code units) are what string offsets are made of;
 *  - **grapheme clusters** are what a user perceives as one character.
 * `A🙂` is 2 grapheme clusters but 3 UTF-16 code units.
 */

/** Grapheme clusters and the subset of them that consists purely of whitespace. */
export interface GraphemeCounts {
  /** User-perceived characters (Unicode grapheme clusters). */
  graphemes: number;
  /** Grapheme clusters made up entirely of `White_Space` code points. */
  whitespace: number;
}

/**
 * Characters that can fuse several code points into one grapheme cluster.
 *
 * When none of them is present in the text, and the text has no surrogate pairs, the grapheme
 * count is exactly the code point count. That lets the hot path skip `Intl.Segmenter` entirely
 * for the overwhelmingly common case (plain Chinese/English prose), which matters a lot at the
 * million-character scale.
 *
 * Covered here: combining marks, ZWJ/ZWNJ, variation selectors, CR (for CRLF), emoji skin-tone
 * modifiers, regional indicators (flags), conjoining Hangul jamo and Unicode prepend marks.
 */
const GRAPHEME_SENSITIVE =
  /[\p{M}\u200C\u200D\uFE0F\r\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{1100}-\u{11FF}\u{A960}-\u{A97F}\u{D7B0}-\u{D7FF}\u0600-\u0605\u06DD\u070F\u0890\u0891\u08E2]/u;

/** A grapheme cluster that is nothing but whitespace. */
const ALL_WHITESPACE = /^\p{White_Space}+$/u;

/** Sticky single-code-point whitespace matcher (all `White_Space` code points are BMP). */
const WHITESPACE_STICKY = /\p{White_Space}/yu;

/** Minimal fallback used when the extended grapheme pattern cannot be constructed at all. */
const SIMPLE_GRAPHEME = /\r\n|[\s\S]/gu;

let segmenterCache: Intl.Segmenter | null | undefined;
let fallbackGraphemePattern: RegExp | null | undefined;

function getSegmenter(): Intl.Segmenter | null {
  if (segmenterCache === undefined) {
    try {
      segmenterCache =
        typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
          ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
          : null;
    } catch {
      segmenterCache = null;
    }
  }
  return segmenterCache;
}

/**
 * Approximation of the extended grapheme cluster boundary rules, used only when
 * `Intl.Segmenter` is unavailable. It handles CRLF, flags, emoji ZWJ sequences, skin-tone
 * modifiers, surrogate pairs and combining marks — the cases that actually show up in prose.
 */
function getFallbackGraphemePattern(): RegExp {
  if (fallbackGraphemePattern === undefined) {
    try {
      fallbackGraphemePattern = new RegExp(
        '\\r\\n' +
          '|[\\u{1F1E6}-\\u{1F1FF}]{2}' +
          '|\\p{Extended_Pictographic}(?:\\p{Emoji_Modifier}|\\uFE0F)?' +
          '(?:\\u200D\\p{Extended_Pictographic}(?:\\p{Emoji_Modifier}|\\uFE0F)?)*' +
          '|\\P{M}\\p{M}*' +
          '|[\\s\\S]',
        'gu',
      );
    } catch {
      fallbackGraphemePattern = null;
    }
  }
  return fallbackGraphemePattern ?? SIMPLE_GRAPHEME;
}

/** Number of Unicode code points in `text` (unpaired surrogates count as one each). */
export function codePointLength(text: string): number {
  const length = text.length;
  let count = 0;
  for (let i = 0; i < length; i++) {
    const unit = text.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff && i + 1 < length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) i++;
    }
    count++;
  }
  return count;
}

/** UTF-16 code units, i.e. `String.prototype.length`. Kept as a named concept on purpose. */
export function utf16Length(text: string): number {
  return text.length;
}

/** Number of `White_Space` code points. */
export function countWhitespaceCodePoints(text: string): number {
  const length = text.length;
  let count = 0;
  let i = 0;
  while (i < length) {
    WHITESPACE_STICKY.lastIndex = i;
    if (WHITESPACE_STICKY.test(text)) {
      count++;
      i = WHITESPACE_STICKY.lastIndex;
    } else {
      i++;
    }
  }
  return count;
}

/** True when the text contains nothing but `White_Space` (or is empty). */
export function isBlank(text: string): boolean {
  if (text.length === 0) return true;
  return ALL_WHITESPACE.test(text);
}

function needsSegmentation(text: string): boolean {
  return GRAPHEME_SENSITIVE.test(text) || text.length !== codePointLength(text);
}

function countWithSegmenter(text: string, segmenter: Intl.Segmenter): GraphemeCounts {
  let graphemes = 0;
  let whitespace = 0;
  for (const part of segmenter.segment(text)) {
    graphemes++;
    if (ALL_WHITESPACE.test(part.segment)) whitespace++;
  }
  return { graphemes, whitespace };
}

function countWithPattern(text: string): GraphemeCounts {
  const pattern = getFallbackGraphemePattern();
  let graphemes = 0;
  let whitespace = 0;
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    // The pattern always consumes at least one character, so this cannot spin forever.
    graphemes++;
    if (ALL_WHITESPACE.test(match[0])) whitespace++;
  }
  return { graphemes, whitespace };
}

/**
 * Count grapheme clusters and the whitespace-only subset of them in one go.
 *
 * Whitespace is measured in grapheme clusters (not code points) so that
 * `graphemes - whitespace` is always a consistent "characters excluding whitespace" value.
 */
export function countGraphemesAndWhitespace(text: string): GraphemeCounts {
  const length = text.length;
  if (length === 0) return { graphemes: 0, whitespace: 0 };

  if (!needsSegmentation(text)) {
    // Fast path: one code point == one grapheme cluster.
    return { graphemes: codePointLength(text), whitespace: countWhitespaceCodePoints(text) };
  }

  const segmenter = getSegmenter();
  return segmenter ? countWithSegmenter(text, segmenter) : countWithPattern(text);
}

/** Convenience wrapper returning only the grapheme cluster count. */
export function countGraphemes(text: string): number {
  return countGraphemesAndWhitespace(text).graphemes;
}

/** A single whitespace code point (anchored, so no `lastIndex` state is involved). */
const SINGLE_WHITESPACE = /^\p{White_Space}$/u;

/** True when `char` is exactly one Unicode whitespace code point. */
export function isWhitespace(char: string): boolean {
  return SINGLE_WHITESPACE.test(char);
}

/** True when the code point is a Unicode line break in the "explicit newline" sense. */
export function isLineBreakCodePoint(codePoint: number): boolean {
  return codePoint === 0x0a || codePoint === 0x0d || codePoint === 0x2028 || codePoint === 0x2029;
}
