/**
 * Unicode helpers. Pure functions, no DOM, so the same code runs on the main thread, in the
 * worker and in Node tests.
 *
 * Two lengths are used throughout and must not be confused: UTF-16 code units (what string
 * offsets are made of) and grapheme clusters (what a user perceives as one character).
 * `A🙂` is 3 code units but 2 characters.
 */

export interface GraphemeCounts {
  graphemes: number;
  whitespace: number;
}

/**
 * Characters that can fuse several code points into one grapheme cluster. When none of them is
 * present, and the text has no surrogate pairs, one code point is exactly one grapheme — which
 * lets the common case skip `Intl.Segmenter` entirely. That matters at the million-character
 * scale this project targets.
 */
const GRAPHEME_SENSITIVE =
  /[\p{M}\u200C\u200D\uFE0F\r\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{1100}-\u{11FF}\u{A960}-\u{A97F}\u{D7B0}-\u{D7FF}\u0600-\u0605\u06DD\u070F\u0890\u0891\u08E2]/u;

const ALL_WHITESPACE = /^\p{White_Space}+$/u;
const WHITESPACE_STICKY = /\p{White_Space}/yu;
const SIMPLE_GRAPHEME = /\r\n|[\s\S]/gu;

let segmenterCache: Intl.Segmenter | null | undefined;
let fallbackPattern: RegExp | null | undefined;

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

/** Approximation of the grapheme boundary rules, used only when `Intl.Segmenter` is missing. */
function getFallbackPattern(): RegExp {
  if (fallbackPattern === undefined) {
    try {
      fallbackPattern = new RegExp(
        '\\r\\n' +
          '|[\\u{1F1E6}-\\u{1F1FF}]{2}' +
          '|\\p{Extended_Pictographic}(?:\\p{Emoji_Modifier}|\\uFE0F)?' +
          '(?:\\u200D\\p{Extended_Pictographic}(?:\\p{Emoji_Modifier}|\\uFE0F)?)*' +
          '|\\P{M}\\p{M}*' +
          '|[\\s\\S]',
        'gu',
      );
    } catch {
      fallbackPattern = null;
    }
  }
  return fallbackPattern ?? SIMPLE_GRAPHEME;
}

/** Code points in `text`. Unpaired surrogates count as one each, matching `for...of`. */
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
  const pattern = getFallbackPattern();
  let graphemes = 0;
  let whitespace = 0;
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    graphemes++;
    if (ALL_WHITESPACE.test(match[0])) whitespace++;
  }
  return { graphemes, whitespace };
}

/**
 * Whitespace is counted as grapheme clusters rather than code points so that
 * `graphemes - whitespace` stays a consistent "characters excluding whitespace".
 */
export function countGraphemesAndWhitespace(text: string): GraphemeCounts {
  if (text.length === 0) return { graphemes: 0, whitespace: 0 };
  if (!needsSegmentation(text)) {
    return { graphemes: codePointLength(text), whitespace: countWhitespaceCodePoints(text) };
  }
  const segmenter = getSegmenter();
  return segmenter ? countWithSegmenter(text, segmenter) : countWithPattern(text);
}
