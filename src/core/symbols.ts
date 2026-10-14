/*
 * symbols.ts — punctuation / symbol classification and counting (TextCount core).
 *
 * This module is a READ-ONLY analysis pass: it never transforms, replaces,
 * normalizes, or otherwise mutates the analyzed text. It takes a string and
 * returns counts.
 *
 * Classification scheme
 * ---------------------
 * The text is walked once, by Unicode CODE POINT (`for...of` iterates code
 * points, so astral characters are handled; unpaired surrogates are skipped
 * because no Unicode property escape matches a lone surrogate). Code points
 * are bucketed into exactly four symbol categories:
 *
 *   ascii      U+0021..U+007E that are NOT ASCII letters or digits. That is
 *              exactly the 32 ASCII punctuation characters. `@`, `[`, `\`,
 *              `]`, `^`, `_`, `` ` `` are included (they live in the ASCII
 *              symbol blocks rather than the ASCII punctuation block).
 *   fullwidth  the full-width forms of those ASCII characters:
 *              U+FF01..U+FF0F, U+FF1A..U+FF20, U+FF3B..U+FF40, U+FF5B..U+FF5E
 *              (a 1:1 map onto the ASCII set above), plus the full-width
 *              currency signs U+FFE0..U+FFE6.
 *   cjk        CJK-native punctuation: the CJK Symbols and Punctuation block
 *              ranges, halfwidth CJK punctuation U+FF61..U+FF65, the vertical
 *              forms / small form variants in U+FE10..U+FE19, U+FE30..U+FE4F
 *              and U+FE50..U+FE6F, plus the CJK-typical quotes, dashes,
 *              ellipses and middle dots enumerated in `CJK_PUNCT_EXTRAS`.
 *   other      anything left whose Unicode general category is punctuation
 *              (\p{P}) or a non-emoji symbol: currency \p{Sc}, modifier
 *              \p{Sk}, math \p{Sm}. \p{So} (other symbol) is deliberately
 *              EXCLUDED, so Emoji, dingbats and pictographs are not reported
 *              as symbols at all.
 *
 * Everything else — whitespace (\p{White_Space}, which wins over every
 * category), letters, digits, marks, \p{So} symbols, unassigned code points —
 * classifies as "not a symbol" (`null`).
 *
 * Counting
 * --------
 * `analyzeSymbols` tallies each distinct symbol code point exactly once in a
 * single Map<string, number> pass and derives every projection from that map,
 * so the report is always self-consistent: `total` equals the sum of the four
 * `categories[].count` values, and each group's `total` equals the sum of its
 * members' counts. No SymbolEntry objects are allocated per occurrence — one
 * is built per DISTINCT symbol after the pass.
 *
 * Zero imports on purpose: pure TypeScript, runs unchanged in a browser and in
 * Node.
 */

export type SymbolCategoryId = 'ascii' | 'fullwidth' | 'cjk' | 'other';

export interface SymbolEntry {
  /** The symbol character itself (a single code point). */
  char: string;
  /** Uppercase code point label, e.g. 'U+002C'. */
  codePoint: string;
  category: SymbolCategoryId;
  /** Number of occurrences in the analyzed text. */
  count: number;
}

export interface SymbolCategoryGroup {
  id: SymbolCategoryId;
  /** Total occurrences of all symbols in this category. */
  count: number;
  /** Number of distinct symbols in this category. */
  distinct: number;
  /** Sorted by count desc, then codePoint asc. */
  entries: SymbolEntry[];
}

export interface SymbolGroupMember {
  char: string;
  codePoint: string;
  category: SymbolCategoryId;
  count: number;
}

export interface RelatedSymbolGroup {
  /** Stable identifier, e.g. 'comma'. */
  id: string;
  members: SymbolGroupMember[];
  /** true when at least TWO distinct members occur at least once. */
  mixed: boolean;
  /** Sum of member counts. */
  total: number;
}

export interface SymbolReport {
  /** Sum of all category counts. */
  total: number;
  /** true when no symbol occurs in the text. */
  empty: boolean;
  /** Always all four categories, in the order ascii, fullwidth, cjk, other. */
  categories: SymbolCategoryGroup[];
  /** Only groups with total > 0, sorted by mixed desc, then total desc, then id asc. */
  groups: RelatedSymbolGroup[];
}

/* ------------------------------------------------------------------ *
 * Unicode property constants.
 *
 * Unicode property escapes must be written as literals to be optimised, so
 * they live here as module-level constants instead of being rebuilt per call.
 * ------------------------------------------------------------------ */

/** Everything matching \p{White_Space} is never a symbol (U+3000, U+00A0, tab, newlines, ...). */
const WHITE_SPACE = /\p{White_Space}/u;
/** Non-emoji symbol: punctuation \p{P}, currency \p{Sc}, modifier \p{Sk}, math \p{Sm}. \p{So} is intentionally absent. */
const PUNCT_OR_SYMBOL = /[\p{P}\p{Sc}\p{Sk}\p{Sm}]/u;
/**
 * Emoji skin-tone modifiers (U+1F3FB..U+1F3FF) are `Sk`, so the generic symbol test would
 * report them. They only ever appear glued to a base emoji, so they are not symbols in their
 * own right and must not show up in the inspector.
 */
const EMOJI_MODIFIER = /\p{Emoji_Modifier}/u;

/* ------------------------------------------------------------------ *
 * Code point predicates.
 * ------------------------------------------------------------------ */

function inRange(cp: number, lo: number, hi: number): boolean {
  return cp >= lo && cp <= hi;
}

/**
 * Numeric fast-reject for scripts that are common in prose and provably contain no
 * punctuation or non-emoji symbol code points.
 *
 * The invariant "every code point in these ranges is not a symbol" is asserted by a unit test
 * that walks the ranges, so adding a range here cannot silently change a count. It matters
 * because it removes two RegExp tests per CJK character on multi-million-character documents.
 */
function isCommonNonSymbol(cp: number): boolean {
  return (
    inRange(cp, 0x3400, 0x4dbf) || // CJK Unified Ideographs Extension A
    inRange(cp, 0x4e00, 0x9fff) || // CJK Unified Ideographs
    inRange(cp, 0xf900, 0xfaff) || // CJK Compatibility Ideographs
    inRange(cp, 0x3041, 0x3096) || // Hiragana
    inRange(cp, 0x30a1, 0x30fa) || // Katakana
    inRange(cp, 0xac00, 0xd7a3) || // Hangul syllables
    inRange(cp, 0x1100, 0x11ff) || // Hangul Jamo
    inRange(cp, 0x0400, 0x04ff) //   Cyrillic
  );
}

/** Full-width forms of the ASCII punctuation/symbol characters, plus U+FFE0..U+FFE6. */
function isFullwidthAscii(cp: number): boolean {
  return (
    inRange(cp, 0xff01, 0xff0f) ||
    inRange(cp, 0xff1a, 0xff20) ||
    inRange(cp, 0xff3b, 0xff40) ||
    inRange(cp, 0xff5b, 0xff5e) ||
    inRange(cp, 0xffe0, 0xffe6)
  );
}

/** CJK-native punctuation. U+2018/U+2019/U+201C/U+201D are treated as CJK-native. */
function isCjkPunctuation(cp: number): boolean {
  return (
    // CJK Symbols and Punctuation, minus the ideographic space U+3000.
    inRange(cp, 0x3001, 0x3003) ||
    inRange(cp, 0x3008, 0x3011) ||
    inRange(cp, 0x3013, 0x301f) ||
    cp === 0x3030 ||
    cp === 0x303d ||
    // Halfwidth CJK punctuation: ｡ ｢ ｣ ､ ･
    inRange(cp, 0xff61, 0xff65) ||
    // Vertical forms, CJK Compatibility Forms, small form variants.
    inRange(cp, 0xfe10, 0xfe19) ||
    inRange(cp, 0xfe30, 0xfe4f) ||
    inRange(cp, 0xfe50, 0xfe6f) ||
    // Curly quotes, dashes, ellipsis, hyphenation point, middle dots.
    cp === 0x2018 ||
    cp === 0x2019 ||
    cp === 0x201c ||
    cp === 0x201d ||
    cp === 0x2013 ||
    cp === 0x2014 ||
    cp === 0x2015 ||
    cp === 0x2026 ||
    cp === 0x2027 ||
    cp === 0x00b7 ||
    cp === 0x30fb ||
    cp === 0x22ef
  );
}

function isAsciiSymbol(cp: number): boolean {
  if (!inRange(cp, 0x21, 0x7e)) return false;
  if (inRange(cp, 0x30, 0x39)) return false; // 0-9
  if (inRange(cp, 0x41, 0x5a)) return false; // A-Z
  if (inRange(cp, 0x61, 0x7a)) return false; // a-z
  return true;
}

/* ------------------------------------------------------------------ *
 * Public classification API.
 * ------------------------------------------------------------------ */

/**
 * Returns the category of a single character, or null when it is not
 * classified as a symbol.
 *
 * Only the first code point of `char` is considered.
 */
export function classifySymbol(char: string): SymbolCategoryId | null {
  if (char.length === 0) return null;

  const cp = char.codePointAt(0);
  if (cp === undefined) return null;

  // Whitespace is never a symbol — this wins over every category below.
  if (WHITE_SPACE.test(char)) return null;

  if (isAsciiSymbol(cp)) return 'ascii';
  if (isFullwidthAscii(cp)) return 'fullwidth';
  if (isCjkPunctuation(cp)) return 'cjk';

  // Cheap rejects before the two remaining RegExp tests.
  if (isCommonNonSymbol(cp)) return null;
  if (EMOJI_MODIFIER.test(char)) return null;
  if (PUNCT_OR_SYMBOL.test(char)) return 'other';

  // Letters, digits, marks, \p{So} (Emoji, dingbats, pictographs), unassigned.
  return null;
}

/** Uppercase code point label, e.g. 'U+002C' / 'U+1F600'. */
function codePointLabel(cp: number): string {
  return `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
}

/* ------------------------------------------------------------------ *
 * Related-symbol groups (exhaustive).
 *
 * Members are listed in display order; a member that never occurs still
 * appears with count 0. Overlapping membership between groups is possible
 * (e.g. U+2026 belongs to `ellipsis` and U+00B7 to `middle-dot`), so the
 * group totals are a per-group view and are not additive across groups.
 * ------------------------------------------------------------------ */

interface RelatedSymbolGroupDefinition {
  readonly id: string;
  readonly members: string;
}

const RELATED_GROUP_DEFS: readonly RelatedSymbolGroupDefinition[] = [
  { id: 'comma', members: ',，、' },
  { id: 'period', members: '.．。' },
  { id: 'colon', members: ':：' },
  { id: 'semicolon', members: ';；' },
  { id: 'exclamation', members: '!！' },
  { id: 'question', members: '?？' },
  { id: 'paren', members: '(（)）' },
  { id: 'bracket', members: '[［]］' },
  { id: 'brace', members: '{｛}｝' },
  { id: 'angle', members: '<＜>＞' },
  { id: 'quote-double', members: '"＂“”' },
  { id: 'quote-single', members: "'＇‘’" },
  { id: 'dash', members: '-－‐–—―' },
  { id: 'ellipsis', members: '…⋯' },
  { id: 'tilde', members: '~～' },
  { id: 'slash', members: '/／' },
  { id: 'backslash', members: '\\＼' },
  { id: 'pipe', members: '|｜' },
  { id: 'at', members: '@＠' },
  { id: 'hash', members: '#＃' },
  { id: 'dollar', members: '$＄' },
  { id: 'percent', members: '%％' },
  { id: 'ampersand', members: '&＆' },
  { id: 'asterisk', members: '*＊' },
  { id: 'plus', members: '+＋' },
  { id: 'equals', members: '=＝' },
  { id: 'underscore', members: '_＿' },
  { id: 'caret', members: '^＾' },
  { id: 'backtick', members: '`｀' },
  { id: 'middle-dot', members: '·・‧•' },
  { id: 'corner-bracket', members: '「」『』' },
  { id: 'book-title', members: '《》〈〉' },
  { id: 'lenticular', members: '【】〔〕〖〗' },
];

const UNCLASSIFIED: SymbolCategoryId = 'other';

/** The four category buckets, always reported in this order. */
const CATEGORY_ORDER: readonly SymbolCategoryId[] = ['ascii', 'fullwidth', 'cjk', 'other'];

function categoryOf(char: string): SymbolCategoryId {
  return classifySymbol(char) ?? UNCLASSIFIED;
}

/** Removes characters that are not classified as symbols (e.g. a stray whitespace member). */
function symbolMembersOf(members: string): string[] {
  const kept: string[] = [];
  for (const char of members) {
    if (classifySymbol(char) !== null) kept.push(char);
  }
  return kept;
}

/* ------------------------------------------------------------------ *
 * Sorting helpers.
 * ------------------------------------------------------------------ */

/** count desc, then codePoint asc. */
function compareEntriesByCountThenCodePoint(
  a: { readonly count: number; readonly codePoint: string },
  b: { readonly count: number; readonly codePoint: string },
): number {
  if (a.count !== b.count) return b.count - a.count;
  return a.codePoint < b.codePoint ? -1 : a.codePoint > b.codePoint ? 1 : 0;
}

/** mixed desc, then total desc, then id asc. */
function compareGroups(
  a: { readonly mixed: boolean; readonly total: number; readonly id: string },
  b: { readonly mixed: boolean; readonly total: number; readonly id: string },
): number {
  if (a.mixed !== b.mixed) return a.mixed ? -1 : 1;
  if (a.total !== b.total) return b.total - a.total;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/* ------------------------------------------------------------------ *
 * Analysis.
 * ------------------------------------------------------------------ */

/**
 * Full analysis of a text.
 *
 * The text is never modified. Every code point is classified and tallied in a
 * single pass; the report is derived from that single tally.
 */
export function analyzeSymbols(text: string): SymbolReport {
  // ONE pass: key = symbol character (one code point), value = occurrences.
  const counts = new Map<string, number>();

  for (const char of text) {
    if (classifySymbol(char) === null) continue;
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }

  // One SymbolEntry per DISTINCT symbol.
  const entriesByCategory = new Map<SymbolCategoryId, SymbolEntry[]>();
  for (const id of CATEGORY_ORDER) entriesByCategory.set(id, []);

  let total = 0;

  for (const [char, count] of counts) {
    const cp = char.codePointAt(0);
    if (cp === undefined) continue;

    const category = categoryOf(char);
    const bucket = entriesByCategory.get(category);
    if (bucket === undefined) continue;

    bucket.push({ char, codePoint: codePointLabel(cp), category, count });
    total += count;
  }

  let empty = true;

  const categories: SymbolCategoryGroup[] = [];
  for (const id of CATEGORY_ORDER) {
    const entries = entriesByCategory.get(id) ?? [];
    entries.sort(compareEntriesByCountThenCodePoint);

    const count = entries.reduce((sum, entry) => sum + entry.count, 0);
    if (count > 0) empty = false;

    categories.push({ id, count, distinct: entries.length, entries });
  }

  const groups: RelatedSymbolGroup[] = [];
  for (const definition of RELATED_GROUP_DEFS) {
    const members: SymbolGroupMember[] = [];
    let groupTotal = 0;
    const occurringCategories = new Set<SymbolCategoryId>();

    for (const char of symbolMembersOf(definition.members)) {
      const liveCp = char.codePointAt(0);
      if (liveCp === undefined) continue;

      const category = categoryOf(char);
      const count = counts.get(char) ?? 0;
      if (count > 0) {
        groupTotal += count;
        occurringCategories.add(category);
      }

      members.push({
        char,
        codePoint: codePointLabel(liveCp),
        category,
        count,
      });
    }

    if (groupTotal === 0) continue;

    groups.push({
      id: definition.id,
      members,
      // "mixed" means the same symbol role shows up in more than one WRITING FORM, i.e. the
      // occurring members span more than one category (half-width / full-width / CJK-typical).
      // Two members of the same category are not a conflict: `(` together with `)` is simply
      // normal ASCII parenthesis usage and must never be reported as a mixed form, otherwise
      // every English sentence would raise a false alarm.
      mixed: occurringCategories.size >= 2,
      total: groupTotal,
    });
  }

  groups.sort(compareGroups);

  return { total, empty, categories, groups };
}
