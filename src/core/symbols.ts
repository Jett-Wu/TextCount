/**
 * Punctuation and symbol classification for the full-width / half-width inspector.
 *
 * Read-only analysis: the text is never transformed, normalised or replaced.
 *
 * Four categories form an exhaustive partition of every code point that is a symbol:
 *   ascii      U+0021–U+007E that are not letters or digits.
 *   fullwidth  their full-width forms (U+FF01–FF0F, FF1A–FF20, FF3B–FF40, FF5B–FF5E) plus
 *              U+FFE0–U+FFE6.
 *   cjk        CJK-native punctuation: the CJK Symbols block, halfwidth CJK punctuation
 *              U+FF61–FF65, the vertical/small form variants, and the curly quotes, dashes,
 *              ellipsis and middle dots Chinese text actually uses.
 *   other      anything left in `\p{P}`, `\p{Sc}`, `\p{Sk}` or `\p{Sm}`. `\p{So}` is excluded
 *              so Emoji, dingbats and pictographs are not reported as punctuation.
 *
 * Whitespace, letters, digits, marks, emoji and unassigned code points classify as `null`.
 */

export type SymbolCategoryId = 'ascii' | 'fullwidth' | 'cjk' | 'other';

export interface SymbolEntry {
  char: string;
  codePoint: string;
  category: SymbolCategoryId;
  count: number;
}

export interface SymbolCategoryGroup {
  id: SymbolCategoryId;
  count: number;
  distinct: number;
  entries: SymbolEntry[];
}

export interface SymbolGroupMember {
  char: string;
  codePoint: string;
  category: SymbolCategoryId;
  count: number;
}

export interface RelatedSymbolGroup {
  id: string;
  members: SymbolGroupMember[];
  /** True when the occurring members span more than one category, i.e. more than one form. */
  mixed: boolean;
  total: number;
}

export interface SymbolReport {
  total: number;
  empty: boolean;
  categories: SymbolCategoryGroup[];
  groups: RelatedSymbolGroup[];
}

const WHITE_SPACE = /\p{White_Space}/u;
const PUNCT_OR_SYMBOL = /[\p{P}\p{Sc}\p{Sk}\p{Sm}]/u;
/** Skin-tone modifiers are `Sk`, so the generic test would report them; they only ever appear
 * glued to a base emoji and must not show up as symbols. */
const EMOJI_MODIFIER = /\p{Emoji_Modifier}/u;

function inRange(cp: number, lo: number, hi: number): boolean {
  return cp >= lo && cp <= hi;
}

/**
 * Fast-reject for ranges that provably contain no symbol, asserted by a unit test that walks
 * them. Removes two RegExp tests per CJK character on multi-million-character documents.
 */
function isCommonNonSymbol(cp: number): boolean {
  return (
    inRange(cp, 0x3400, 0x4dbf) ||
    inRange(cp, 0x4e00, 0x9fff) ||
    inRange(cp, 0xf900, 0xfaff) ||
    inRange(cp, 0x3041, 0x3096) ||
    inRange(cp, 0x30a1, 0x30fa) ||
    inRange(cp, 0xac00, 0xd7a3) ||
    inRange(cp, 0x1100, 0x11ff) ||
    inRange(cp, 0x0400, 0x04ff)
  );
}

function isFullwidthAscii(cp: number): boolean {
  return (
    inRange(cp, 0xff01, 0xff0f) ||
    inRange(cp, 0xff1a, 0xff20) ||
    inRange(cp, 0xff3b, 0xff40) ||
    inRange(cp, 0xff5b, 0xff5e) ||
    inRange(cp, 0xffe0, 0xffe6)
  );
}

function isCjkPunctuation(cp: number): boolean {
  return (
    inRange(cp, 0x3001, 0x3003) ||
    inRange(cp, 0x3008, 0x3011) ||
    inRange(cp, 0x3013, 0x301f) ||
    cp === 0x3030 ||
    cp === 0x303d ||
    inRange(cp, 0xff61, 0xff65) ||
    inRange(cp, 0xfe10, 0xfe19) ||
    inRange(cp, 0xfe30, 0xfe4f) ||
    inRange(cp, 0xfe50, 0xfe6f) ||
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
  if (inRange(cp, 0x30, 0x39)) return false;
  if (inRange(cp, 0x41, 0x5a)) return false;
  if (inRange(cp, 0x61, 0x7a)) return false;
  return true;
}

/** Only the first code point of `char` is considered. */
export function classifySymbol(char: string): SymbolCategoryId | null {
  if (char.length === 0) return null;
  const cp = char.codePointAt(0);
  if (cp === undefined) return null;

  if (WHITE_SPACE.test(char)) return null;
  if (isAsciiSymbol(cp)) return 'ascii';
  if (isFullwidthAscii(cp)) return 'fullwidth';
  if (isCjkPunctuation(cp)) return 'cjk';
  if (isCommonNonSymbol(cp)) return null;
  if (EMOJI_MODIFIER.test(char)) return null;
  if (PUNCT_OR_SYMBOL.test(char)) return 'other';
  return null;
}

function codePointLabel(cp: number): string {
  return `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
}

/**
 * Symbols that play the same role and could therefore be confused with each other. Members are
 * kept separate and independently counted — `。`(U+3002), `．`(U+FF0E) and `.`(U+002E) are three
 * different characters and are never merged.
 */
const RELATED_GROUPS: readonly { id: string; members: string }[] = [
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

const CATEGORY_ORDER: readonly SymbolCategoryId[] = ['ascii', 'fullwidth', 'cjk', 'other'];

function compareEntries(
  a: { count: number; codePoint: string },
  b: { count: number; codePoint: string },
): number {
  if (a.count !== b.count) return b.count - a.count;
  return a.codePoint < b.codePoint ? -1 : a.codePoint > b.codePoint ? 1 : 0;
}

function compareGroups(
  a: { mixed: boolean; total: number; id: string },
  b: { mixed: boolean; total: number; id: string },
): number {
  if (a.mixed !== b.mixed) return a.mixed ? -1 : 1;
  if (a.total !== b.total) return b.total - a.total;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** One tally pass; every projection is derived from it, so the report is self-consistent. */
export function analyzeSymbols(text: string): SymbolReport {
  const counts = new Map<string, number>();
  for (const char of text) {
    if (classifySymbol(char) === null) continue;
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }

  const buckets = new Map<SymbolCategoryId, SymbolEntry[]>();
  for (const id of CATEGORY_ORDER) buckets.set(id, []);

  let total = 0;
  for (const [char, count] of counts) {
    const cp = char.codePointAt(0);
    if (cp === undefined) continue;
    const category = classifySymbol(char) ?? 'other';
    buckets.get(category)?.push({ char, codePoint: codePointLabel(cp), category, count });
    total += count;
  }

  let empty = true;
  const categories: SymbolCategoryGroup[] = [];
  for (const id of CATEGORY_ORDER) {
    const entries = buckets.get(id) ?? [];
    entries.sort(compareEntries);
    const count = entries.reduce((sum, entry) => sum + entry.count, 0);
    if (count > 0) empty = false;
    categories.push({ id, count, distinct: entries.length, entries });
  }

  const groups: RelatedSymbolGroup[] = [];
  for (const definition of RELATED_GROUPS) {
    const members: SymbolGroupMember[] = [];
    const occurringCategories = new Set<SymbolCategoryId>();
    let groupTotal = 0;

    for (const char of definition.members) {
      if (classifySymbol(char) === null) continue;
      const cp = char.codePointAt(0);
      if (cp === undefined) continue;
      const category = classifySymbol(char) ?? 'other';
      const count = counts.get(char) ?? 0;
      if (count > 0) {
        groupTotal += count;
        occurringCategories.add(category);
      }
      members.push({ char, codePoint: codePointLabel(cp), category, count });
    }

    if (groupTotal === 0) continue;

    groups.push({
      id: definition.id,
      members,
      // Two members of the same category are not a conflict: `(` with `)` is ordinary ASCII
      // parenthesis usage and must not be reported as a mixed form, or every English sentence
      // would raise a false alarm.
      mixed: occurringCategories.size >= 2,
      total: groupTotal,
    });
  }

  groups.sort(compareGroups);
  return { total, empty, categories, groups };
}
