/**
 * P1 analysis layer: paragraph distribution and term frequency. Pure TypeScript, no DOM and no
 * Node, so the main thread, the worker and the tests all produce identical numbers.
 */

import { codePointLength, countWhitespaceCodePoints } from './unicode';

/* ---------- paragraphs ---------- */

export interface Paragraph {
  /** 0-based index among NON-BLANK paragraphs, in document order. */
  index: number;
  /** UTF-16 offset of the paragraph's first character. */
  start: number;
  /** UTF-16 offset just past the last character (exclusive). */
  end: number;
  /** User-perceived characters in this paragraph. */
  graphemes: number;
  /** Characters excluding whitespace. */
  charsNoSpace: number;
}

export interface ParagraphReport {
  /** Number of non-blank paragraphs. Blank lines are NOT paragraphs. */
  count: number;
  /** Number of lines that contained only whitespace. */
  blankLines: number;
  /** Mean graphemes per paragraph, or 0 when there are none. Not rounded. */
  average: number;
  /** Median graphemes per paragraph (lower middle for an even count), or 0. */
  median: number;
  /** Graphemes in the longest paragraph, or 0. */
  longest: number;
  /** In document order, capped at `maxParagraphs`. */
  paragraphs: Paragraph[];
  /** True when `paragraphs` holds fewer entries than `count`. */
  truncated: boolean;
}

const DEFAULT_MAX_PARAGRAPHS = 2000;
const LINE_BREAK = /\r\n|[\n\r\u2028\u2029]/g;
/**
 * `\p{White_Space}` rather than `\s`: the two differ on U+FEFF, which a word processor can leave
 * at the start of a pasted line and which must not make that line look like a paragraph.
 */
const NON_WHITESPACE = /\P{White_Space}/u;
const WHITESPACE_ONLY = /^\p{White_Space}+$/u;

let graphemeSegmenterCache: Intl.Segmenter | null | undefined;

function getGraphemeSegmenter(): Intl.Segmenter | null {
  if (graphemeSegmenterCache === undefined) {
    try {
      graphemeSegmenterCache =
        typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
          ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
          : null;
    } catch {
      graphemeSegmenterCache = null;
    }
  }
  return graphemeSegmenterCache;
}

interface GraphemeCounts {
  graphemes: number;
  whitespace: number;
}

interface ParagraphRange {
  start: number;
  end: number;
}

/** UTF-16 offsets of every line break, with `\r\n` collapsed to a single entry. */
function findBreaks(text: string): number[] {
  const breaks: number[] = [];
  LINE_BREAK.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LINE_BREAK.exec(text)) !== null) breaks.push(match.index);
  return breaks;
}

/**
 * One `Intl.Segmenter` pass over the whole document, bucketed by paragraph. Segmenting each
 * paragraph separately would allocate a fresh string per paragraph, which a multi-megabyte
 * document cannot afford, and the same pass fills in both numbers.
 */
function countGraphemesByRanges(
  text: string,
  ranges: readonly ParagraphRange[],
): GraphemeCounts[] {
  const stats: GraphemeCounts[] = ranges.map(() => ({ graphemes: 0, whitespace: 0 }));
  const segmenter = getGraphemeSegmenter();
  if (segmenter === null) return countGraphemesBySlice(text, ranges);

  let index = 0;
  try {
    for (const part of segmenter.segment(text)) {
      // A segment can begin before the range it belongs to, e.g. the `\r\n` of a CRLF break ends
      // after the paragraph does, so a range is left behind only once the segment starts past it.
      // Blank lines contribute no range at all, which is what makes a zero-length run unobservable.
      while (index < ranges.length && part.index >= (ranges[index]?.end ?? 0)) index++;
      if (index >= ranges.length) break;
      const range = ranges[index];
      const bucket = stats[index];
      if (range === undefined || bucket === undefined || part.index < range.start) continue;
      bucket.graphemes++;
      if (WHITESPACE_ONLY.test(part.segment)) bucket.whitespace++;
    }
  } catch {
    return countGraphemesBySlice(text, ranges);
  }
  return stats;
}

/**
 * Safety net for a missing or misbehaving segmenter. It slices one string per paragraph, so it
 * exists only for the case where the single-pass path is unavailable; code points then stand in
 * for clusters, which over-counts lone combining marks and ZWJ sequences.
 */
function countGraphemesBySlice(text: string, ranges: readonly ParagraphRange[]): GraphemeCounts[] {
  return ranges.map((range) => {
    const slice = text.slice(range.start, range.end);
    return {
      graphemes: codePointLength(slice),
      whitespace: countWhitespaceCodePoints(slice),
    };
  });
}

function recordLine(
  text: string,
  start: number,
  end: number,
  ranges: ParagraphRange[],
): boolean {
  if (NON_WHITESPACE.test(text.slice(start, end))) {
    ranges.push({ start, end });
    return false;
  }
  return true;
}

export function analyzeParagraphs(
  text: string,
  options?: { maxParagraphs?: number },
): ParagraphReport {
  const maxParagraphs = Math.max(
    0,
    Math.floor(options?.maxParagraphs ?? DEFAULT_MAX_PARAGRAPHS),
  );
  const length = text.length;
  const ranges: ParagraphRange[] = [];
  let blankLines = 0;
  let cursor = 0;
  let lineRecorded = false;

  for (const breakStart of findBreaks(text)) {
    const breakEnd =
      text.charCodeAt(breakStart) === 0x0d && text[breakStart + 1] === '\n'
        ? breakStart + 2
        : breakStart + 1;
    // A lone `\n` of a `\r\n` pair was already consumed by `breakEnd`; do not count it twice.
    if (!lineRecorded && (cursor < breakStart || cursor < breakEnd)) {
      if (recordLine(text, cursor, breakStart, ranges)) blankLines++;
      lineRecorded = true;
    }
    cursor = breakEnd;
    lineRecorded = false;
  }
  if (cursor < length && recordLine(text, cursor, length, ranges)) blankLines++;

  const counts = countGraphemesByRanges(text, ranges);
  const sizes = counts.map((entry) => entry.graphemes);
  const sorted = [...sizes].sort((left, right) => left - right);
  const paragraphs: Paragraph[] = [];
  const kept = Math.min(ranges.length, maxParagraphs);
  for (let index = 0; index < kept; index++) {
    const range = ranges[index];
    const entry = counts[index];
    if (range === undefined || entry === undefined) break;
    paragraphs.push({
      index,
      start: range.start,
      end: range.end,
      graphemes: entry.graphemes,
      charsNoSpace: entry.graphemes - entry.whitespace,
    });
  }

  let total = 0;
  for (const size of sizes) total += size;

  return {
    count: ranges.length,
    blankLines,
    average: sizes.length === 0 ? 0 : total / sizes.length,
    median: medianOf(sorted),
    longest: sorted.length === 0 ? 0 : (sorted[sorted.length - 1] ?? 0),
    paragraphs,
    truncated: paragraphs.length < ranges.length,
  };
}

/** The lower middle, so an even count still has an answer that is a length some paragraph has. */
function medianOf(sorted: readonly number[]): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;
}

/* ---------- frequency ---------- */

export type FrequencyUnit = 'word' | 'character';

export interface FrequencyEntry {
  term: string;
  count: number;
}

export interface FrequencyReport {
  unit: FrequencyUnit;
  /** Word-like tokens seen in the whole text, before stop-word filtering. */
  totalTokens: number;
  /** Distinct terms retained after filtering. */
  distinct: number;
  /** Sorted by count desc, then term ascending. Capped at `maxEntries`. */
  entries: FrequencyEntry[];
  /** True when `entries` holds fewer entries than `distinct`. */
  truncated: boolean;
  /**
   * True when `Intl.Segmenter` was unavailable or threw and the regex fallback ran. It does NOT
   * mean the ranking is a good word list: every engine segments Chinese differently and some do it
   * badly, which no flag can capture — see the note above `getWordSegmenter`.
   */
  degraded: boolean;
}

export interface FrequencyOptions {
  unit?: FrequencyUnit;
  /** BCP-47 tag passed to `Intl.Segmenter`. */
  locale?: string;
  /** Drop common function words. Default true. */
  filterStopWords?: boolean;
  /** Drop tokens that are only decimal digits. Default true. */
  excludeNumbers?: boolean;
  /**
   * Shortest term kept in the `'word'` unit, in code points. Default 2, because a single
   * character is usually a segmentation fragment rather than a word; the `'character'` unit is
   * where single characters belong. Set to 1 to keep everything the segmenter returns.
   */
  minTermLength?: number;
  /** Default 200. */
  maxEntries?: number;
}

const DEFAULT_MAX_ENTRIES = 200;
const LATIN_LETTER = /\p{Script=Latin}/u;
/**
 * Any letter outside Latin, i.e. a script `toLocaleLowerCase` must not touch. A lookahead rather
 * than `v`-flag set difference, which the `es2022` build target does not guarantee.
 */
const NON_LATIN_LETTER = /(?!\p{Script=Latin})\p{L}/u;
/**
 * A term with no letter at all is a number, not a word. Testing for the absence of letters rather
 * than for a pure digit run also drops `0.7` and `1,000`, which the segmenter hands back as single
 * word-like tokens and which would otherwise sit in a word ranking next to real words.
 */
const NO_LETTER = /^(?!.*\p{L})/u;
const HAN_OR_KANA = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
/**
 * Fallback only. Needs the `u` flag: without it `\p{...}` is not a property escape and the
 * pattern silently matches the literal text `p{...}`, turning every count into zero.
 */
const FALLBACK_TOKEN =
  /\p{Script=Latin}[\p{Script=Latin}\p{M}'\u2019-]*|\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}+/gu;

const STOP_WORDS: ReadonlySet<string> = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'is', 'are', 'was', 'were', 'be',
  'been', 'it', 'its', 'this', 'that', 'these', 'those', 'for', 'on', 'with', 'as', 'at', 'by',
  'from', 'he', 'she', 'they', 'we', 'you', 'i', 'not', 'no', 'do', 'does', 'did', 'have', 'has',
  'had', 'will', 'would', 'can', 'could', 'should', 'there', 'their', 'them', 'his', 'her', 'our',
  'your', 'my', 'me', 'him', 'us', 'if', 'then', 'than', 'so', 'up', 'out', 'about', 'into',
  'over', 'after', 'before', 'more', 'most', 'some', 'any', 'all', 'each', 'other', 'such',
  'only', 'own', 'same', 'too', 'very', 'just',
  '的', '了', '和', '是', '在', '我', '有', '就', '不', '人', '都', '一', '一个', '上', '也',
  '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '那', '他',
  '她', '它', '们', '而', '与', '及', '或', '但', '把', '被', '为', '以', '对', '从', '于',
]);

/** Cache the failure as well: a runtime without `Intl.Segmenter` never grows one mid-session. */
let wordSegmenterCache: Intl.Segmenter | null | undefined;

/*
 * Everyone's `Intl.Segmenter` is not the same segmenter, and the difference is quality rather than
 * detail. Measured on the same 640-character Chinese article:
 *
 *   Chromium / WebKit ICU   预测:7  方法:6  模型:5  数据:5  线路:5 …   a usable word list
 *   Firefox ICU             上原:1  定位:1  排序:1  第一:1  段落:1 …   splits 工具 into two
 *                                                                     fragments and merges
 *                                                                     the unrelated 对上原文
 *                                                                     into 上原
 *
 * Firefox does have a Chinese dictionary, so this is not a "no dictionary" case that could be
 * detected and announced — a probe phrase like 这是一个工具 passes there. It is simply a weaker
 * dictionary. The honest response is the standing note in the UI plus keeping the ranking
 * switchable to characters, rather than hiding the list or claiming a limitation that is not real.
 */

function getWordSegmenter(locale: string | undefined): Intl.Segmenter | null {
  /**
   * One segmenter for the process, so a second call with a different `locale` reuses it. Word
   * segmentation is dictionary-driven rather than locale-driven, so the tag changes nothing here;
   * case folding, which the tag does affect, is applied per term by `normalizeTerm`.
   */
  if (wordSegmenterCache !== undefined) return wordSegmenterCache;
  try {
    wordSegmenterCache =
      typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
        ? new Intl.Segmenter(locale, { granularity: 'word' })
        : null;
  } catch {
    wordSegmenterCache = null;
  }
  return wordSegmenterCache;
}

/**
 * Segments and counts in one pass, so a multi-megabyte document never materialises one string per
 * token. Every distinct term is counted: `distinct` is a reported number, not an implementation
 * detail, and it has to be exact even when the ranking keeps only `maxEntries` of them.
 */
function countWordLike(
  text: string,
  locale: string | undefined,
  keep: (term: string) => boolean,
  counts: Map<string, number>,
  segmenter: Intl.Segmenter | null,
): number {
  let total = 0;
  const accept = (token: string): void => {
    total++;
    const term = normalizeTerm(token, locale);
    if (!keep(term)) return;
    counts.set(term, (counts.get(term) ?? 0) + 1);
  };

  if (segmenter !== null) {
    for (const part of segmenter.segment(text)) {
      if (part.isWordLike === true) accept(part.segment);
    }
    return total;
  }

  FALLBACK_TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FALLBACK_TOKEN.exec(text)) !== null) accept(match[0]);
  return total;
}

/**
 * Latin terms are case-folded so `Don't` and `DON'T` share an entry. Folding must not reach any
 * other script, so the folded form is kept only when nothing but Latin letters survived it — an
 * allow-list of scripts would silently start folding whatever it had not been taught about.
 * A contraction's apostrophe is `Script=Common` and must not block the fold.
 */
function normalizeTerm(term: string, locale: string | undefined): string {
  if (term.length === 0) return term;
  let latin = false;
  for (const character of term) {
    if (LATIN_LETTER.test(character)) latin = true;
    else if (NON_LATIN_LETTER.test(character)) return term;
  }
  if (!latin) return term;
  let folded: string;
  try {
    folded = term.toLocaleLowerCase(locale);
  } catch {
    folded = term.toLowerCase();
  }
  // `tr` and `az` map `İ` to `i` plus a combining dot, so the fold has to be re-checked rather
  // than assumed safe because the input was Latin.
  return NON_LATIN_LETTER.test(folded) ? term : folded;
}

/**
 * Han and Kana only, one code point per entry: a per-character cloud must never be presented as
 * if it were a Chinese word cloud.
 */
function countCharacters(text: string): { map: Map<string, number>; total: number } {
  const map = new Map<string, number>();
  let total = 0;
  for (const character of text) {
    if (!HAN_OR_KANA.test(character)) continue;
    total++;
    map.set(character, (map.get(character) ?? 0) + 1);
  }
  return { map, total };
}

export function analyzeFrequency(text: string, options?: FrequencyOptions): FrequencyReport {
  const unit: FrequencyUnit = options?.unit ?? 'word';
  const maxEntries = Math.max(0, Math.floor(options?.maxEntries ?? DEFAULT_MAX_ENTRIES));
  const locale = options?.locale;
  // Both filters define a word list, and a character report is explicitly not one.
  const filterStopWords = unit === 'word' && (options?.filterStopWords ?? true);
  const excludeNumbers = unit === 'word' && (options?.excludeNumbers ?? true);
  const minTermLength = unit === 'word' ? Math.max(1, options?.minTermLength ?? 2) : 1;

  let counted: Map<string, number>;
  let totalTokens: number;
  let distinct: number;
  let degraded = false;

  if (unit === 'character') {
    const characters = countCharacters(text);
    counted = characters.map;
    totalTokens = characters.total;
    distinct = counted.size;
  } else {
    counted = new Map<string, number>();
    const keep = (term: string): boolean => {
      if (excludeNumbers && NO_LETTER.test(term)) return false;
      // A one-character term in a word report is almost always a segmentation fragment rather
      // than a word: on real Chinese prose ICU yields 法 from 四阶段法, 客 from 客流, 性 from
      // 准确性, and those fragments then outrank the actual words. Single characters are what
      // the 'character' unit is for, so nothing is lost — it is reported where it belongs.
      if (codePointLength(term) < minTermLength) return false;
      return !(filterStopWords && STOP_WORDS.has(term));
    };
    const segmenter = getWordSegmenter(locale);
    if (segmenter === null) {
      totalTokens = countWordLike(text, locale, keep, counted, null);
      degraded = true;
    } else {
      try {
        totalTokens = countWordLike(text, locale, keep, counted, segmenter);
      } catch {
        counted = new Map<string, number>();
        totalTokens = countWordLike(text, locale, keep, counted, null);
        degraded = true;
      }
    }
    distinct = counted.size;
  }

  const ranked: FrequencyEntry[] = [...counted].map(([term, count]) => ({ term, count }));
  /*
   * Ties are broken by code point, not by collation.
   *
   * `localeCompare` consults the host's default locale, so the same document ranked 汉 above 字 on
   * a zh-CN machine (pinyin: hàn before zì) and 字 above 汉 on an en-US one, where code-point order
   * applies. A ranking that quietly depends on the reader's system language is not a ranking; the
   * regression surfaced as a unit test that passed locally and failed on CI.
   */
  ranked.sort(
    (left, right) =>
      right.count - left.count ||
      (left.term < right.term ? -1 : left.term > right.term ? 1 : 0),
  );

  return {
    unit,
    totalTokens,
    distinct,
    entries: ranked.slice(0, maxEntries),
    truncated: distinct > maxEntries,
    degraded,
  };
}
