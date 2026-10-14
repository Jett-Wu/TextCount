/**
 * The counting engine and the counting rules it implements.
 *
 * `analyzeText` makes one classification pass over the code points plus one grapheme pass, and
 * returns every number the interface can show. It never truncates, samples or approximates.
 *
 * These rules are the contract with `tests/unit/count.test.ts` and with the wording in
 * `src/locales/`. Changing one means changing all three.
 *
 * - Characters: user-perceived characters via `Intl.Segmenter`, never `String.length`.
 * - Whitespace: grapheme clusters made up entirely of `White_Space`; `graphemesNoWhitespace`
 *   is `graphemes - whitespace` by construction.
 * - Han: one per code point whose script is Han, including the extension and compatibility
 *   blocks, plus U+3007 and U+3005. CJK punctuation (、。) is `Script=Common`, so it is counted
 *   as punctuation and never as a Han character.
 * - Kana: one per code point, plus the prolonged sound and iteration marks U+30FC/309D/309E/30FD/30FE.
 * - Latin words: one per run of Latin letters; a single `'`, `’`, `‐` or `-` between letters
 *   keeps the run together.
 * - Digit runs: one per run of `\p{Nd}`; a single `.` or `,` between digits keeps it together.
 * - Other scripts: space-separated word runs, one per run. Scripts written without spaces
 *   (Thai, Lao, Khmer) cannot be segmented this way and are a documented limitation.
 * - Punctuation: one per code point in category `P`. Emoji and other symbols are not
 *   punctuation; they are still counted in the character totals.
 *
 * The mixed metric never includes whitespace, emoji or symbols:
 *   han + kana + latinWords + otherWords + digits? + punctuation?
 */

import { codePointLength, countGraphemesAndWhitespace } from './unicode';

export type PrimaryMetricId = 'mixed' | 'han' | 'latinWords' | 'charsNoSpace';

export interface CountSettings {
  /** Which number the headline shows. */
  primaryMetric: PrimaryMetricId;
  countDigitRuns: boolean;
  countPunctuation: boolean;
}

export const PRIMARY_METRICS: readonly PrimaryMetricId[] = [
  'mixed',
  'han',
  'latinWords',
  'charsNoSpace',
];

export const DEFAULT_COUNT_SETTINGS: CountSettings = {
  primaryMetric: 'mixed',
  countDigitRuns: true,
  countPunctuation: false,
};

/** Turns untrusted input (e.g. a value read back from storage) into valid settings. */
export function normalizeCountSettings(value: unknown): CountSettings {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_COUNT_SETTINGS };
  const candidate = value as Record<string, unknown>;
  const metric = candidate['primaryMetric'];
  return {
    primaryMetric: PRIMARY_METRICS.includes(metric as PrimaryMetricId)
      ? (metric as PrimaryMetricId)
      : DEFAULT_COUNT_SETTINGS.primaryMetric,
    countDigitRuns:
      typeof candidate['countDigitRuns'] === 'boolean'
        ? candidate['countDigitRuns']
        : DEFAULT_COUNT_SETTINGS.countDigitRuns,
    countPunctuation:
      typeof candidate['countPunctuation'] === 'boolean'
        ? candidate['countPunctuation']
        : DEFAULT_COUNT_SETTINGS.countPunctuation,
  };
}

export interface TextStats {
  primary: number;
  primaryMetric: PrimaryMetricId;
  mixed: number;
  han: number;
  kana: number;
  latinWords: number;
  digitRuns: number;
  otherWords: number;
  punctuation: number;
  graphemes: number;
  whitespace: number;
  graphemesNoWhitespace: number;
  utf16Length: number;
  codePoints: number;
  lines: number;
  paragraphs: number;
}

/**
 * Every pattern needs the `u` flag. Without it `\p{...}` is not a property escape at all —
 * it degrades into the literal text `p{...}`, which matches nothing and raises no error, so
 * every non-ASCII count silently becomes zero.
 */
const WHITESPACE_RUN = /\p{White_Space}+/yu;
const PUNCTUATION_AT = /\p{P}/yu;
const HAN_RUN = /\p{Script=Han}+/yu;
const KANA_RUN = /[\p{Script=Hiragana}\p{Script=Katakana}\u30FC\u309D\u309E\u30FD\u30FE]+/yu;
const LATIN_WORD = /\p{Script=Latin}+(?:['\u2019\u2010-]\p{Script=Latin}+)*/yu;
const DIGIT_RUN = /\p{Nd}+(?:[.,]\p{Nd}+)*/yu;
const OTHER_WORD_RUN = /[\p{L}\p{M}\p{Nl}\p{Mn}\p{Mc}]+/yu;
const ANY_PUNCTUATION = /\p{P}/u;

/**
 * ASCII fast path, derived from `\p{P}` at load rather than hand-written: the naive
 * "0x21–0x2F is punctuation" range is wrong, because `$`, `+ < = > | ~` and `` ^ ` `` are
 * symbols. Deriving it keeps the fast path and the Unicode path from ever disagreeing.
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

/** ASCII-only words are resolved without touching a RegExp; only a joiner or a non-ASCII
 * letter can extend the run past it. */
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
  const mightExtend =
    next === 0x27 || next === 0x2d || next === 0x2019 || next === 0x2010 || next >= 0x80;
  if (!mightExtend) return i;
  const end = matchEnd(LATIN_WORD, text, start);
  return end > i ? end : i;
}

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
          i += unit === 0x0d && text.charCodeAt(i + 1) === 0x0a ? 2 : 1;
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
      i += 1;
      continue;
    }

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

    // Emoji, symbols and unassigned code points: counted as characters, but not as words.
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
