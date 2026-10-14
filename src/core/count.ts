/**
 * The counting engine.
 *
 * `analyzeText` performs exactly one classification pass over the code points of the text plus
 * one grapheme-cluster pass, and returns every number the UI can display. It never truncates,
 * samples or approximates: whatever the caller passes in is fully counted.
 *
 * ## Counting rules (the contract with the tests)
 *
 * **Grapheme characters** — user-perceived characters via `Intl.Segmenter`
 * (`granularity: 'grapheme'`), never `String.prototype.length`.
 *
 * **Whitespace** — grapheme clusters made up entirely of Unicode `White_Space` code points.
 * `graphemesNoWhitespace = graphemes - whitespace` by construction.
 *
 * **Han characters** — one unit per code point whose Unicode script is `Han`. This includes the
 * CJK extension blocks (not just U+4E00–U+9FFF), the compatibility ideographs, U+3007 (〇) and
 * the iteration mark U+3005 (々). CJK punctuation such as 、。 is `Script=Common`, so it is
 * counted as punctuation and never as a Han character.
 *
 * **Kana** — one unit per Hiragana/Katakana code point, plus the prolonged sound mark U+30FC and
 * the iteration marks U+309D/309E/30FD/30FE, because those scripts are written without spaces.
 *
 * **Latin words** — one unit per run of `Script=Latin` letters. A single `'`, `’`, `‐` or `-`
 * between letters keeps the run together, so `don't` and `well-known` are one word each.
 *
 * **Digit runs** — one unit per run of decimal digits (`\p{Nd}`). A single `.` or `,` between
 * two digits keeps the run together, so `3.14` and `1,000` are one unit each.
 *
 * **Other words** — every other letter (Greek, Cyrillic, Arabic, Hangul, …) forms space-separated
 * word runs and counts one unit per run. Scripts that are written without spaces (Thai, Lao,
 * Khmer, Japanese beyond Kana) cannot be segmented reliably by this rule and are documented as a
 * known limitation rather than silently mis-counted.
 *
 * **Punctuation** — one unit per code point in Unicode category `P`. Emoji, currency, maths and
 * other symbols are *not* punctuation; they are still fully counted in the character totals and
 * are listed in the symbol inspector.
 *
 * The mixed ("字数") metric is:
 * `han + kana + latinWords + otherWords + (countDigitRuns ? digitRuns : 0) + (countPunctuation ? punctuation : 0)`
 * and it never includes whitespace, emoji or symbols.
 */

import type { CountSettings, PrimaryMetricId } from './rules';
import { codePointLength, countGraphemesAndWhitespace } from './unicode';

export interface TextStats {
  /** Headline number, selected by `settings.primaryMetric`. */
  primary: number;
  /** Which metric `primary` currently reflects. */
  primaryMetric: PrimaryMetricId;
  /** The mixed metric regardless of which metric is selected as `primary`. */
  mixed: number;
  han: number;
  kana: number;
  latinWords: number;
  digitRuns: number;
  /** Word runs in scripts other than Han, Kana and Latin. */
  otherWords: number;
  /** Code points in Unicode category `P`. */
  punctuation: number;
  /** User-perceived characters, including whitespace. */
  graphemes: number;
  /** Whitespace grapheme clusters. */
  whitespace: number;
  /** `graphemes - whitespace`. */
  graphemesNoWhitespace: number;
  /** UTF-16 code units, exposed so the UI can explain why it differs from `graphemes`. */
  utf16Length: number;
  codePoints: number;
  /** Number of explicit line breaks + 1 (0 for empty text). */
  lines: number;
  /** Lines that contain at least one non-whitespace character; blank lines are not paragraphs. */
  paragraphs: number;
}

// Every pattern below needs the `u` flag: Unicode property escapes (`\p{...}`) are only
// interpreted as properties in Unicode mode, and without it they silently degrade into literal
// text that never matches.
const WHITESPACE_RUN = /\p{White_Space}+/yu;
const PUNCTUATION_AT = /\p{P}/yu;
const HAN_RUN = /\p{Script=Han}+/yu;
const KANA_RUN = /[\p{Script=Hiragana}\p{Script=Katakana}\u30FC\u309D\u309E\u30FD\u30FE]+/yu;
const LATIN_WORD = /\p{Script=Latin}+(?:['\u2019\u2010-]\p{Script=Latin}+)*/yu;
const DIGIT_RUN = /\p{Nd}+(?:[.,]\p{Nd}+)*/yu;
const OTHER_WORD_RUN = /[\p{L}\p{M}\p{Nl}\p{Mn}\p{Mc}]+/yu;
const ANY_PUNCTUATION = /\p{P}/u;

/**
 * ASCII fast-path lookup: `1` only for ASCII code points whose Unicode general category is `P`.
 *
 * The set is derived from `\p{P}` at module load instead of being hand-written, because the
 * naive "0x21–0x2F is punctuation" range is wrong: `$` (Sc), `+` `<` `=` `>` `|` `~` (Sm) and
 * `^` `` ` `` (Sk) are symbols. Keeping the table authoritative means the fast path and the
 * non-ASCII path can never disagree about what counts as punctuation.
 */
const ASCII_PUNCTUATION: Uint8Array = (() => {
  const table = new Uint8Array(0x80);
  for (let code = 0x21; code <= 0x7e; code++) {
    if (ANY_PUNCTUATION.test(String.fromCharCode(code))) table[code] = 1;
  }
  return table;
})();

function matchEnd(pattern: RegExp, text: string, index: number): number {
  pattern.lastIndex = index;
  const match = pattern.exec(text);
  return match === null ? -1 : index + match[0].length;
}

/** Counts code points between two UTF-16 offsets without allocating a substring. */
function countCodePointsInRange(text: string, start: number, end: number): number {
  let count = 0;
  for (let i = start; i < end; i++) {
    const unit = text.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff && i + 1 < end) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) i++;
    }
    count++;
  }
  return count;
}

function advanceCodePoint(text: string, index: number): number {
  const unit = text.charCodeAt(index);
  if (unit >= 0xd800 && unit <= 0xdbff && index + 1 < text.length) {
    const next = text.charCodeAt(index + 1);
    if (next >= 0xdc00 && next <= 0xdfff) return index + 2;
  }
  return index + 1;
}

/**
 * Scans one Latin word starting at `start`, where `text[start]` is known to be a Latin letter.
 * ASCII-only words are resolved without touching a RegExp.
 */
function scanLatinWord(text: string, start: number): number {
  const length = text.length;
  let i = start;
  while (i < length) {
    const unit = text.charCodeAt(i);
    if ((unit >= 0x41 && unit <= 0x5a) || (unit >= 0x61 && unit <= 0x7a)) {
      i++;
      continue;
    }
    break;
  }
  const next = i < length ? text.charCodeAt(i) : -1;
  // Only a joiner or a non-ASCII letter can extend the word beyond the ASCII run.
  const mightExtend =
    next === 0x27 || next === 0x2d || next === 0x2019 || next === 0x2010 || next >= 0x80;
  if (!mightExtend) return i;
  const end = matchEnd(LATIN_WORD, text, start);
  return end > i ? end : i;
}

/** Scans one digit run starting at `start`, where `text[start]` is known to be an ASCII digit. */
function scanDigitRun(text: string, start: number): number {
  const length = text.length;
  let i = start;
  for (;;) {
    while (i < length) {
      const unit = text.charCodeAt(i);
      if (unit >= 0x30 && unit <= 0x39) {
        i++;
        continue;
      }
      break;
    }
    if (i + 1 < length && (text.charCodeAt(i) === 0x2e || text.charCodeAt(i) === 0x2c)) {
      const after = text.charCodeAt(i + 1);
      if (after >= 0x30 && after <= 0x39) {
        i++;
        continue;
      }
    }
    break;
  }
  const next = i < length ? text.charCodeAt(i) : -1;
  if (next >= 0x80) {
    const end = matchEnd(DIGIT_RUN, text, start);
    if (end > i) return end;
  }
  return i;
}

export function analyzeText(text: string, settings: CountSettings): TextStats {
  const length = text.length;

  let han = 0;
  let kana = 0;
  let latinWords = 0;
  let digitRuns = 0;
  let otherWords = 0;
  let punctuation = 0;
  let lineBreaks = 0;
  let paragraphs = 0;
  let lineHasContent = false;

  let i = 0;
  while (i < length) {
    const unit = text.charCodeAt(i);

    // ---------------------------------------------------------------- ASCII
    if (unit < 0x80) {
      if ((unit >= 0x41 && unit <= 0x5a) || (unit >= 0x61 && unit <= 0x7a)) {
        i = scanLatinWord(text, i);
        latinWords++;
        lineHasContent = true;
        continue;
      }
      if (unit >= 0x30 && unit <= 0x39) {
        i = scanDigitRun(text, i);
        digitRuns++;
        lineHasContent = true;
        continue;
      }
      if (unit === 0x20 || (unit >= 0x09 && unit <= 0x0d)) {
        if (unit === 0x0d || unit === 0x0a) {
          lineBreaks++;
          if (unit === 0x0d && text.charCodeAt(i + 1) === 0x0a) i += 2;
          else i += 1;
          if (lineHasContent) paragraphs++;
          lineHasContent = false;
          continue;
        }
        i += 1;
        continue;
      }
      if (ASCII_PUNCTUATION[unit] === 1) {
        punctuation++;
        i += 1;
        lineHasContent = true;
        continue;
      }
      // Remaining C0/C1 controls carry no text content.
      i += 1;
      continue;
    }

    // ------------------------------------------------------------ non-ASCII
    let end = matchEnd(WHITESPACE_RUN, text, i);
    if (end !== -1) {
      const codePoint = text.codePointAt(i) ?? 0;
      if (codePoint === 0x2028 || codePoint === 0x2029) {
        lineBreaks++;
        if (lineHasContent) paragraphs++;
        lineHasContent = false;
      }
      i = end;
      continue;
    }

    end = matchEnd(HAN_RUN, text, i);
    if (end !== -1) {
      han += countCodePointsInRange(text, i, end);
      i = end;
      lineHasContent = true;
      continue;
    }

    end = matchEnd(KANA_RUN, text, i);
    if (end !== -1) {
      kana += countCodePointsInRange(text, i, end);
      i = end;
      lineHasContent = true;
      continue;
    }

    end = matchEnd(LATIN_WORD, text, i);
    if (end !== -1) {
      latinWords++;
      i = end;
      lineHasContent = true;
      continue;
    }

    end = matchEnd(DIGIT_RUN, text, i);
    if (end !== -1) {
      digitRuns++;
      i = end;
      lineHasContent = true;
      continue;
    }

    PUNCTUATION_AT.lastIndex = i;
    if (PUNCTUATION_AT.test(text)) {
      punctuation++;
      i = PUNCTUATION_AT.lastIndex;
      lineHasContent = true;
      continue;
    }

    end = matchEnd(OTHER_WORD_RUN, text, i);
    if (end !== -1) {
      otherWords++;
      i = end;
      lineHasContent = true;
      continue;
    }

    // Emoji, symbols, unassigned code points and anything else: fully counted as characters,
    // but not part of any word or punctuation total.
    i = advanceCodePoint(text, i);
  }

  if (lineHasContent) paragraphs++;

  const graphemeCounts = countGraphemesAndWhitespace(text);
  const graphemesNoWhitespace = graphemeCounts.graphemes - graphemeCounts.whitespace;

  const mixed =
    han +
    kana +
    latinWords +
    otherWords +
    (settings.countDigitRuns ? digitRuns : 0) +
    (settings.countPunctuation ? punctuation : 0);

  return {
    primary: selectPrimary(settings.primaryMetric, mixed, han, latinWords, graphemesNoWhitespace),
    primaryMetric: settings.primaryMetric,
    mixed,
    han,
    kana,
    latinWords,
    digitRuns,
    otherWords,
    punctuation,
    graphemes: graphemeCounts.graphemes,
    whitespace: graphemeCounts.whitespace,
    graphemesNoWhitespace,
    utf16Length: length,
    codePoints: codePointLength(text),
    lines: length === 0 ? 0 : lineBreaks + 1,
    paragraphs,
  };
}

function selectPrimary(
  metric: PrimaryMetricId,
  mixed: number,
  han: number,
  latinWords: number,
  graphemesNoWhitespace: number,
): number {
  switch (metric) {
    case 'han':
      return han;
    case 'latinWords':
      return latinWords;
    case 'charsNoSpace':
      return graphemesNoWhitespace;
    case 'mixed':
    default:
      return mixed;
  }
}

/** Stats for an empty document; used as the initial UI state so nothing renders `undefined`. */
export const EMPTY_STATS: TextStats = {
  primary: 0,
  primaryMetric: 'mixed',
  mixed: 0,
  han: 0,
  kana: 0,
  latinWords: 0,
  digitRuns: 0,
  otherWords: 0,
  punctuation: 0,
  graphemes: 0,
  whitespace: 0,
  graphemesNoWhitespace: 0,
  utf16Length: 0,
  codePoints: 0,
  lines: 0,
  paragraphs: 0,
};

/** True when `char` is a Unicode punctuation code point (category `P`). */
export function isPunctuation(char: string): boolean {
  return ANY_PUNCTUATION.test(char);
}
