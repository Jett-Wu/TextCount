/*
 * Unit tests for src/core/symbols.ts (TextCount).
 *
 * The module under test classifies and counts punctuation / symbol code points
 * in a text. It is strictly READ-ONLY: it never transforms, replaces or
 * normalizes the analyzed text.
 *
 * Classification scheme under test:
 *   whitespace (\p{White_Space}) -> never a symbol (U+3000, U+00A0, tab, ...)
 *   ascii      -> U+0021..U+007E minus ASCII letters/digits (32 characters)
 *   fullwidth  -> U+FF01..U+FF0F, U+FF1A..U+FF20, U+FF3B..U+FF40,
 *                 U+FF5B..U+FF5E, U+FFE0..U+FFE6
 *   cjk        -> CJK-native punctuation: U+3001..U+3003, U+3008..U+3011,
 *                 U+3013..U+301F, U+3030, U+303D, halfwidth U+FF61..U+FF65,
 *                 U+FE10..U+FE19, U+FE30..U+FE4F, U+FE50..U+FE6F, the curly
 *                 quotes U+2018/19/1C/1D, the dashes U+2013/14/15, U+2026,
 *                 U+2027, U+00B7, U+30FB, U+22EF
 *   other      -> remaining \p{P} plus non-emoji symbols \p{Sc}, \p{Sk},
 *                 \p{Sm}. \p{So} is EXCLUDED, so Emoji are not symbols.
 *   anything else -> null (letters, digits, marks, Emoji, unassigned)
 *
 * Every assertion below pins EXACT numbers. Notably the tests lock in that
 * `。` (U+3002), `.` (U+002E) and `．` (U+FF0E) stay three separate members of
 * the `period` group, that a symbol which belongs to no group still appears in
 * `categories`, and that the report is internally consistent
 * (`total` === Σ categories[].count).
 */

import { describe, expect, it } from 'vitest';

import { analyzeSymbols, classifySymbol } from '../../src/core/symbols';
import type {
  RelatedSymbolGroup,
  SymbolCategoryGroup,
  SymbolEntry,
  SymbolReport,
} from '../../src/core/symbols';

/** All four category ids, in the order every report must use. */
const CATEGORY_ORDER = ['ascii', 'fullwidth', 'cjk', 'other'] as const;

/** A few characters used repeatedly, written as escapes to stay readable. */
const FULLWIDTH_COMMA = '\uFF0C'; // ，
const IDEOGRAPHIC_FULL_STOP = '\u3002'; // 。
const FULLWIDTH_FULL_STOP = '\uFF0E'; // ．

/** char -> count over the whole report. */
function tally(report: SymbolReport): Map<string, number> {
  const out = new Map<string, number>();
  for (const category of report.categories) {
    for (const entry of category.entries) out.set(entry.char, entry.count);
  }
  return out;
}

function categoryOf(report: SymbolReport, id: string): SymbolCategoryGroup {
  const found = report.categories.find((category) => category.id === id);
  if (found === undefined) throw new Error(`category missing from report: ${id}`);
  return found;
}

function entryOf(report: SymbolReport, char: string): SymbolEntry {
  for (const category of report.categories) {
    const found = category.entries.find((entry) => entry.char === char);
    if (found !== undefined) return found;
  }
  throw new Error(`entry missing from report: ${JSON.stringify(char)}`);
}

function groupOf(report: SymbolReport, id: string) {
  const found = report.groups.find((group) => group.id === id);
  if (found === undefined) throw new Error(`group missing from report: ${id}`);
  return found;
}

function memberCounts(report: SymbolReport, id: string): [string, number][] {
  return groupOf(report, id).members.map((member) => [member.char, member.count]);
}

function requireEntry(entry: SymbolEntry | undefined): SymbolEntry {
  if (entry === undefined) throw new Error('unreachable: entry index out of range');
  return entry;
}

function requireGroup(group: RelatedSymbolGroup | undefined): RelatedSymbolGroup {
  if (group === undefined) throw new Error('unreachable: group index out of range');
  return group;
}

describe('classifySymbol', () => {
  it('classifies the canonical example of each category', () => {
    expect(classifySymbol(',')).toBe('ascii');
    expect(classifySymbol(FULLWIDTH_COMMA)).toBe('fullwidth');
    expect(classifySymbol(IDEOGRAPHIC_FULL_STOP)).toBe('cjk');
    expect(classifySymbol('\u3001')).toBe('cjk'); // 、
    expect(classifySymbol('\u20AC')).toBe('other'); // €
  });

  it('returns null for letters, Han characters, emoji and whitespace', () => {
    expect(classifySymbol('A')).toBeNull();
    expect(classifySymbol('汉')).toBeNull();
    expect(classifySymbol('\uD83D\uDE42')).toBeNull(); // 🙂 U+1F642 (surrogate pair)
    expect(classifySymbol('\u3000')).toBeNull(); // ideographic space
    expect(classifySymbol(' ')).toBeNull();
  });

  it('returns null for ASCII digits and for the empty string', () => {
    expect(classifySymbol('0')).toBeNull();
    expect(classifySymbol('5')).toBeNull();
    expect(classifySymbol('9')).toBeNull();
    expect(classifySymbol('')).toBeNull();
  });

  it('classifies all 32 ASCII punctuation/symbol characters as ascii', () => {
    const asciiSymbols = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';
    expect([...asciiSymbols]).toHaveLength(32);
    for (const char of asciiSymbols) expect(classifySymbol(char)).toBe('ascii');
  });

  it('classifies full-width forms (incl. U+FFE0..U+FFE6) as fullwidth', () => {
    expect(classifySymbol('!')).toBe('ascii');
    expect(classifySymbol('\uFF01')).toBe('fullwidth'); // ！ U+FF01
    expect(classifySymbol('\uFF0F')).toBe('fullwidth'); // ／ U+FF0F
    expect(classifySymbol('\uFF20')).toBe('fullwidth'); // ＠ U+FF20
    expect(classifySymbol('\uFF3B')).toBe('fullwidth'); // ［ U+FF3B
    expect(classifySymbol('\uFF40')).toBe('fullwidth'); // ｀ U+FF40 (Sk in Unicode)
    expect(classifySymbol('\uFF5B')).toBe('fullwidth'); // ｛ U+FF5B
    expect(classifySymbol('\uFF5E')).toBe('fullwidth'); // ～ U+FF5E (Sm in Unicode)
    expect(classifySymbol('\uFFE0')).toBe('fullwidth'); // ￠ U+FFE0
    expect(classifySymbol('\uFFE1')).toBe('fullwidth'); // ￡ U+FFE1
    expect(classifySymbol('\uFFE5')).toBe('fullwidth'); // ￥ U+FFE5
    expect(classifySymbol('\uFFE6')).toBe('fullwidth'); // ￦ U+FFE6
  });

  it('classifies halfwidth CJK punctuation, curly quotes and CJK dashes as cjk', () => {
    expect(classifySymbol('\uFF61')).toBe('cjk'); // ｡
    expect(classifySymbol('\uFF62')).toBe('cjk'); // ｢
    expect(classifySymbol('\uFF65')).toBe('cjk'); // ･
    expect(classifySymbol('\uFE10')).toBe('cjk'); // ︐
    expect(classifySymbol('\uFE4F')).toBe('cjk'); // ﹏
    expect(classifySymbol('\uFE50')).toBe('cjk'); // ﹐
    expect(classifySymbol('\u201C')).toBe('cjk'); // “
    expect(classifySymbol('\u2014')).toBe('cjk'); // —
    expect(classifySymbol('\u2015')).toBe('cjk'); // ―
    expect(classifySymbol('\u2026')).toBe('cjk'); // …
    expect(classifySymbol('\u00B7')).toBe('cjk'); // ·
    expect(classifySymbol('\u30FB')).toBe('cjk'); // ・
    expect(classifySymbol('\u300C')).toBe('cjk'); // 「
    expect(classifySymbol('\u300B')).toBe('cjk'); // 》
    expect(classifySymbol('\u3010')).toBe('cjk'); // 【
  });

  it('classifies currency, math and modifier symbols as other', () => {
    expect(classifySymbol('\u20AC')).toBe('other'); // € Sc
    expect(classifySymbol('\u00A3')).toBe('other'); // £ Sc
    expect(classifySymbol('\u00A4')).toBe('other'); // ¤ Sc
    expect(classifySymbol('\u00B1')).toBe('other'); // ± Sm
    expect(classifySymbol('\u00D7')).toBe('other'); // × Sm
    expect(classifySymbol('\u00A7')).toBe('other'); // § Po
    expect(classifySymbol('\u00AB')).toBe('other'); // « Pi
    expect(classifySymbol('\u2022')).toBe('other'); // • Po (member of `middle-dot`)
    expect(classifySymbol('\u00B6')).toBe('other'); // ¶ Po
  });

  it('prefers the cjk rule over "other" for CJK-native code points', () => {
    // U+22EF is \p{Sm} and would otherwise land in `other`; the CJK rule wins
    // because it is listed as a CJK-native code point.
    expect(classifySymbol('\u22EF')).toBe('cjk'); // ⋯
  });

  it('routes ASCII-range Sk/Sm code points to ascii, not other', () => {
    expect(classifySymbol('~')).toBe('ascii'); // Sm in Unicode
    expect(classifySymbol('^')).toBe('ascii'); // Sk in Unicode
    expect(classifySymbol('`')).toBe('ascii'); // Sk in Unicode
  });

  it('excludes \\p{So} code points such as emoji, dingbats and U+3013', () => {
    expect(classifySymbol('\uD83D\uDE42')).toBeNull(); // 🙂 So
    expect(classifySymbol('\u2764')).toBeNull(); // ❤ So
    expect(classifySymbol('\uFE0F')).toBeNull(); // variation selector U+FE0F (Mn)
    expect(classifySymbol('\u2728')).toBeNull(); // ✨ So
    expect(classifySymbol('\u2600')).toBeNull(); // ☀ So
    expect(classifySymbol('\u00A9')).toBeNull(); // © So
    expect(classifySymbol('\u00AE')).toBeNull(); // ® So
    // U+3013 is \p{So} but sits inside the explicitly listed CJK range
    // U+3013..U+301F, so the CJK rule wins over the \p{So} exclusion.
    expect(classifySymbol('\u3013')).toBe('cjk'); // 〓
  });

  it('excludes whitespace forms, including ones inside symbol blocks', () => {
    expect(classifySymbol('\u3000')).toBeNull(); // ideographic space
    expect(classifySymbol('\u00A0')).toBeNull(); // no-break space
    expect(classifySymbol('\t')).toBeNull();
    expect(classifySymbol('\n')).toBeNull();
    expect(classifySymbol('\r')).toBeNull();
  });

  it('returns null for unpaired surrogates instead of throwing', () => {
    expect(classifySymbol('\uD83D')).toBeNull(); // lone high surrogate
    expect(classifySymbol('\uDE42')).toBeNull(); // lone low surrogate
  });
});

describe('analyzeSymbols — exact per-character counts', () => {
  it('counts , ， . ． 。 : ： ( ) （ ） exactly, never merging the period variants', () => {
    const report = analyzeSymbols(',\uFF0C.\uFF0E\u3002:\uFF1A()\uFF08\uFF09');

    // 11 distinct symbols, each occurring exactly once.
    expect(report.total).toBe(11);
    expect(report.empty).toBe(false);

    const t = tally(report);
    expect(t.size).toBe(11);
    expect(t.get(',')).toBe(1);
    expect(t.get(FULLWIDTH_COMMA)).toBe(1);
    expect(t.get('.')).toBe(1);
    expect(t.get(FULLWIDTH_FULL_STOP)).toBe(1);
    expect(t.get(IDEOGRAPHIC_FULL_STOP)).toBe(1);
    expect(t.get(':')).toBe(1);
    expect(t.get('\uFF1A')).toBe(1);
    expect(t.get('(')).toBe(1);
    expect(t.get(')')).toBe(1);
    expect(t.get('\uFF08')).toBe(1);
    expect(t.get('\uFF09')).toBe(1);

    // `。`, `.` and `．` remain three separate, independently counted members.
    expect(entryOf(report, '.')).toMatchObject({
      char: '.',
      codePoint: 'U+002E',
      category: 'ascii',
      count: 1,
    });
    expect(entryOf(report, FULLWIDTH_FULL_STOP)).toMatchObject({
      char: FULLWIDTH_FULL_STOP,
      codePoint: 'U+FF0E',
      category: 'fullwidth',
      count: 1,
    });
    expect(entryOf(report, IDEOGRAPHIC_FULL_STOP)).toMatchObject({
      char: IDEOGRAPHIC_FULL_STOP,
      codePoint: 'U+3002',
      category: 'cjk',
      count: 1,
    });

    // ascii: , . : ( )  -> 5 occurrences, 5 distinct
    expect(categoryOf(report, 'ascii').count).toBe(5);
    expect(categoryOf(report, 'ascii').distinct).toBe(5);
    // fullwidth: ， ． ： （ ） -> 5 occurrences, 5 distinct
    expect(categoryOf(report, 'fullwidth').count).toBe(5);
    expect(categoryOf(report, 'fullwidth').distinct).toBe(5);
    // cjk: 。 -> 1 occurrence
    expect(categoryOf(report, 'cjk').count).toBe(1);
    expect(categoryOf(report, 'cjk').distinct).toBe(1);
    // other: nothing
    expect(categoryOf(report, 'other').count).toBe(0);
    expect(categoryOf(report, 'other').distinct).toBe(0);
    expect(categoryOf(report, 'other').entries).toEqual([]);

    // total is the sum of the category counts.
    expect(report.total).toBe(
      report.categories.reduce((sum, category) => sum + category.count, 0),
    );
  });

  it('reports period as mixed with three distinct non-zero members', () => {
    const report = analyzeSymbols(',\uFF0C.\uFF0E\u3002:\uFF1A()\uFF08\uFF09');
    const period = groupOf(report, 'period');

    expect(period.mixed).toBe(true);
    expect(period.total).toBe(3);
    expect(period.members.map((member) => member.char)).toEqual([
      '.',
      FULLWIDTH_FULL_STOP,
      IDEOGRAPHIC_FULL_STOP,
    ]);
    expect(period.members.map((member) => member.count)).toEqual([1, 1, 1]);
    expect(period.members.map((member) => member.codePoint)).toEqual([
      'U+002E',
      'U+FF0E',
      'U+3002',
    ]);
    expect(period.members.map((member) => member.category)).toEqual([
      'ascii',
      'fullwidth',
      'cjk',
    ]);
  });

  it('accumulates repeated occurrences', () => {
    const report = analyzeSymbols('a,,,b\u3002\u3002c\uFF01\uFF01');

    expect(report.total).toBe(7);
    const t = tally(report);
    expect(t.get(',')).toBe(3);
    expect(t.get(IDEOGRAPHIC_FULL_STOP)).toBe(2);
    expect(t.get('\uFF01')).toBe(2);
    expect(t.size).toBe(3);

    expect(groupOf(report, 'comma').total).toBe(3);
    expect(groupOf(report, 'comma').mixed).toBe(false); // only `,` occurs
    expect(groupOf(report, 'exclamation').total).toBe(2);
    expect(groupOf(report, 'exclamation').mixed).toBe(false); // only `！` occurs
  });
});

describe('analyzeSymbols — empty and symbol-free input', () => {
  it('returns an empty report for the empty string', () => {
    const report = analyzeSymbols('');

    expect(report.total).toBe(0);
    expect(report.empty).toBe(true);
    expect(report.groups).toEqual([]);
    expect(report.categories.map((category) => category.id)).toEqual([...CATEGORY_ORDER]);
    expect(report.categories).toHaveLength(4);
    for (const category of report.categories) {
      expect(category.count).toBe(0);
      expect(category.distinct).toBe(0);
      expect(category.entries).toEqual([]);
    }
  });

  it('returns an empty report for whitespace-only strings', () => {
    const samples = ['   ', '\t\n\r', '\u3000\u3000', '\u00A0 \u3000\n', ' \t \u3000 '];
    for (const text of samples) {
      const report = analyzeSymbols(text);
      expect(report.total).toBe(0);
      expect(report.empty).toBe(true);
      expect(report.groups).toEqual([]);
      expect(report.categories.map((category) => category.id)).toEqual([...CATEGORY_ORDER]);
      expect(report.categories.map((category) => category.distinct)).toEqual([0, 0, 0, 0]);
    }
  });

  it('returns an empty report for text with no symbols at all', () => {
    const report = analyzeSymbols('你好 hello 123');

    expect(report.total).toBe(0);
    expect(report.empty).toBe(true);
    expect(report.groups).toEqual([]);
    expect(report.categories).toHaveLength(4);
    for (const category of report.categories) {
      expect(category.count).toBe(0);
      expect(category.distinct).toBe(0);
    }
  });

  it('excludes emoji entirely', () => {
    const report = analyzeSymbols('a\uD83D\uDE42b\u2764\uFE0F');

    expect(report.total).toBe(0);
    expect(report.empty).toBe(true);
    expect(report.groups).toEqual([]);
    expect(report.categories.map((category) => category.count)).toEqual([0, 0, 0, 0]);
  });

  it('still reports all four categories in order when some are empty', () => {
    const report = analyzeSymbols('\uFF0C\u3002');

    expect(report.categories.map((category) => category.id)).toEqual([
      'ascii',
      'fullwidth',
      'cjk',
      'other',
    ]);
    expect(categoryOf(report, 'ascii').distinct).toBe(0);
    expect(categoryOf(report, 'fullwidth').count).toBe(1);
    expect(categoryOf(report, 'cjk').count).toBe(1);
    expect(categoryOf(report, 'other').distinct).toBe(0);
    expect(report.total).toBe(2);
  });
});

describe('analyzeSymbols — related-symbol groups', () => {
  it('flags a Chinese/English sentence mixing half-width and full-width commas', () => {
    const report = analyzeSymbols('你好, 世界，这是一句话。');
    const comma = groupOf(report, 'comma');

    expect(comma.mixed).toBe(true);
    expect(comma.total).toBe(2);
    expect(memberCounts(report, 'comma')).toEqual([
      [',', 1],
      [FULLWIDTH_COMMA, 1],
      ['\u3001', 0], // 、 never occurs but is still listed
    ]);
    expect(comma.members.map((member) => member.codePoint)).toEqual([
      'U+002C',
      'U+FF0C',
      'U+3001',
    ]);
    expect(comma.members.map((member) => member.category)).toEqual([
      'ascii',
      'fullwidth',
      'cjk',
    ]);

    expect(report.total).toBe(3); // , ， 。
    expect(report.groups.map((group) => group.id).sort()).toEqual(['comma', 'period']);
  });

  it('is not mixed when a single member repeats', () => {
    const report = analyzeSymbols('a,b,c');
    const comma = groupOf(report, 'comma');

    expect(comma.total).toBe(2);
    expect(comma.mixed).toBe(false);
    expect(memberCounts(report, 'comma')).toEqual([
      [',', 2],
      [FULLWIDTH_COMMA, 0],
      ['\u3001', 0],
    ]);
  });

  it('is mixed when two distinct members occur, even one occurrence each', () => {
    const report = analyzeSymbols('a,b、c');
    const comma = groupOf(report, 'comma');

    expect(comma.total).toBe(2);
    expect(comma.mixed).toBe(true);
    expect(memberCounts(report, 'comma')).toEqual([
      [',', 1],
      [FULLWIDTH_COMMA, 0],
      ['\u3001', 1],
    ]);
  });

  it('keeps an ungrouped symbol in categories while no group contains it', () => {
    const report = analyzeSymbols('\u00A7\u00AB\u00BB'); // § « »

    expect(report.total).toBe(3);
    expect(report.empty).toBe(false);
    expect(categoryOf(report, 'other').count).toBe(3);
    expect(categoryOf(report, 'other').distinct).toBe(3);
    expect(tally(report).get('\u00A7')).toBe(1);
    expect(tally(report).get('\u00AB')).toBe(1);
    expect(tally(report).get('\u00BB')).toBe(1);
    expect(report.groups).toEqual([]);
  });

  it('emits a group only when total > 0, with the member list still complete', () => {
    const report = analyzeSymbols('\u300C你好\u300D'); // 「你好」

    expect(report.total).toBe(2);
    expect(report.groups.map((group) => group.id)).toEqual(['corner-bracket']);
    const corner = report.groups[0];
    if (corner === undefined) throw new Error('unreachable: corner-bracket group missing');
    expect(corner.total).toBe(2);
    // `mixed` means "the same symbol role appears in more than one WRITING FORM", i.e. the
    // occurring members span more than one category. 「 and 」 are both CJK-typical, so two
    // distinct members of the same category are NOT reported as a mixed form.
    expect(corner.mixed).toBe(false);
    expect(corner.members).toHaveLength(4);
    expect(corner.members.map((member) => member.char)).toEqual([
      '\u300C',
      '\u300D',
      '\u300E',
      '\u300F',
    ]);
    expect(corner.members.map((member) => member.count)).toEqual([1, 1, 0, 0]);
  });

  it('exposes the middle-dot group across cjk and other categories', () => {
    const report = analyzeSymbols('\u00B7\u30FB\u2027\u2022'); // · ・ ‧ •

    expect(report.total).toBe(4);
    const middleDot = groupOf(report, 'middle-dot');
    expect(middleDot.total).toBe(4);
    expect(middleDot.mixed).toBe(true);
    expect(middleDot.members.map((member) => member.char)).toEqual([
      '\u00B7',
      '\u30FB',
      '\u2027',
      '\u2022',
    ]);
    expect(middleDot.members.map((member) => member.count)).toEqual([1, 1, 1, 1]);
    expect(middleDot.members.map((member) => member.codePoint)).toEqual([
      'U+00B7',
      'U+30FB',
      'U+2027',
      'U+2022',
    ]);
    // The first three are CJK-native, U+2022 bullet is a plain math/other punctuation.
    expect(middleDot.members.map((member) => member.category)).toEqual([
      'cjk',
      'cjk',
      'cjk',
      'other',
    ]);
  });

  it('keeps the ellipsis group to its two members', () => {
    const report = analyzeSymbols('\u2026'); // …

    const ellipsis = groupOf(report, 'ellipsis');
    expect(ellipsis.total).toBe(1);
    expect(ellipsis.mixed).toBe(false);
    expect(ellipsis.members.map((member) => member.char)).toEqual(['\u2026', '\u22EF']);
    expect(ellipsis.members.map((member) => member.count)).toEqual([1, 0]);
    expect(categoryOf(report, 'cjk').count).toBe(1);
    expect(report.total).toBe(1);
  });
});

describe('analyzeSymbols — report consistency', () => {
  const text =
    '你好，世界! 这是 (测试). "引号"、书名《》…… a-b/c@d#e$f%g&h*i+j=k_l^m~n|o\\p<q>r[s]t{u}v`w\'x';

  it('has total equal to the sum of category counts', () => {
    const report = analyzeSymbols(text);
    const categorySum = report.categories.reduce((sum, category) => sum + category.count, 0);

    // 35 occurrences of 33 distinct symbols: ascii 29/28, fullwidth 1/1,
    // cjk 5/4 and other 0/0. `"` U+0022 and `"` U+201C are distinct symbols.
    expect(report.total).toBe(35);
    expect(report.total).toBe(categorySum);
    expect(report.empty).toBe(false);
    expect(report.categories.map((category) => `${category.id}:${category.count}/${category.distinct}`)).toEqual([
      'ascii:29/28',
      'fullwidth:1/1',
      'cjk:5/4',
      'other:0/0',
    ]);
    expect(
      report.categories.reduce((sum, category) => sum + category.distinct, 0),
    ).toBe(33);
  });

  it('has each category count equal to the sum of its entries and distinct = entries.length', () => {
    const report = analyzeSymbols(text);

    for (const category of report.categories) {
      const entrySum = category.entries.reduce((sum, entry) => sum + entry.count, 0);
      expect(category.count).toBe(entrySum);
      expect(category.distinct).toBe(category.entries.length);
    }
  });

  it('has every group total equal to the sum of its member counts', () => {
    const report = analyzeSymbols(text);

    expect(report.groups.length).toBeGreaterThan(0);
    for (const group of report.groups) {
      const memberSum = group.members.reduce((sum, member) => sum + member.count, 0);
      expect(group.total).toBe(memberSum);
      expect(group.total).toBeGreaterThan(0);
      const occurringCategories = new Set(
        group.members.filter((member) => member.count > 0).map((member) => member.category),
      );
      expect(group.mixed).toBe(occurringCategories.size >= 2);
    }
  });

  it('accounts for every symbol through the groups when every symbol belongs to a group', () => {
    const report = analyzeSymbols(',\uFF0C\u3001.\uFF0E\u3002:\uFF1A()\uFF08\uFF09!\uFF01?\uFF1F~\uFF5E');

    const categorySum = report.categories.reduce((sum, category) => sum + category.count, 0);
    const groupSum = report.groups.reduce((sum, group) => sum + group.total, 0);

    // 18 occurrences: comma 3, period 3, colon 2, paren 4, exclamation 2,
    // question 2, tilde 2.
    expect(report.total).toBe(18);
    expect(report.total).toBe(categorySum);
    expect(groupSum).toBe(report.total);
    expect(report.categories.map((category) => `${category.id}:${category.count}/${category.distinct}`)).toEqual([
      'ascii:8/8',
      'fullwidth:8/8',
      'cjk:2/2',
      'other:0/0',
    ]);
    expect(report.groups.map((group) => group.id).sort()).toEqual([
      'colon',
      'comma',
      'exclamation',
      'paren',
      'period',
      'question',
      'tilde',
    ]);
  });

  it('never mutates or normalizes the analyzed text', () => {
    const original = '，。,. \u3000';
    const copy = String(original);
    analyzeSymbols(original);
    expect(original).toBe(copy);
  });
});

describe('analyzeSymbols — sorting and determinism', () => {
  it('sorts entries by count desc, then codePoint asc', () => {
    const report = analyzeSymbols(',,,.\uFF0E\u3002"'); // , , , . ． 。 "

    // ascii: `,` x3, then `"` x1 and `.` x1 -> count desc puts `,` first,
    // the two singletons tie and are ordered by ascending code point.
    expect(categoryOf(report, 'ascii').entries.map((entry) => entry.codePoint)).toEqual([
      'U+002C', // , x3
      'U+0022', // " x1
      'U+002E', // . x1
    ]);
    expect(categoryOf(report, 'ascii').entries.map((entry) => entry.count)).toEqual([3, 1, 1]);

    // fullwidth: `．` x1 only — `"` in the text is the ASCII quote U+0022,
    // which stays a separate symbol from the full-width ＂ U+FF02.
    expect(categoryOf(report, 'fullwidth').entries.map((entry) => entry.codePoint)).toEqual([
      'U+FF0E',
    ]);
    expect(categoryOf(report, 'fullwidth').entries.map((entry) => entry.count)).toEqual([1]);
    expect(tally(report).has('\uFF02')).toBe(false);

    // cjk: 。 x1
    expect(categoryOf(report, 'cjk').entries.map((entry) => entry.codePoint)).toEqual(['U+3002']);
  });

  it('orders a fullwidth tie by ascending code point', () => {
    const report = analyzeSymbols('\uFF5E\uFF01\uFF0E'); // ～ ！ ．

    expect(categoryOf(report, 'fullwidth').entries.map((entry) => entry.codePoint)).toEqual([
      'U+FF01',
      'U+FF0E',
      'U+FF5E',
    ]);
    expect(categoryOf(report, 'fullwidth').entries.map((entry) => entry.count)).toEqual([1, 1, 1]);
  });

  it('breaks count ties by ascending code point in every category', () => {
    const report = analyzeSymbols('~^_,.:;');

    expect(categoryOf(report, 'ascii').count).toBe(7);
    expect(categoryOf(report, 'ascii').entries.map((entry) => entry.codePoint)).toEqual([
      'U+002C', // ,
      'U+002E', // .
      'U+003A', // :
      'U+003B', // ;
      'U+005E', // ^
      'U+005F', // _
      'U+007E', // ~
    ]);

    for (const category of report.categories) {
      for (let i = 1; i < category.entries.length; i += 1) {
        const previous = requireEntry(category.entries[i - 1]);
        const current = requireEntry(category.entries[i]);
        if (previous.count === current.count) {
          expect(previous.codePoint < current.codePoint).toBe(true);
        } else {
          expect(previous.count).toBeGreaterThan(current.count);
        }
      }
    }
  });

  it('sorts groups by mixed desc, then total desc, then id asc', () => {
    // comma: mixed (`,` x2 + `，` x1) total 3
    // period: mixed (`.` x1 + `．` x1 + `。` x1) total 3
    // at: not mixed, total 1
    const report = analyzeSymbols(',,\uFF0C.\uFF0E\u3002@');

    expect(report.groups.map((group) => group.id)).toEqual(['comma', 'period', 'at']);
    expect(groupOf(report, 'comma').total).toBe(3);
    expect(groupOf(report, 'period').total).toBe(3);
    expect(groupOf(report, 'at').total).toBe(1);

    for (let i = 1; i < report.groups.length; i += 1) {
      const previous = requireGroup(report.groups[i - 1]);
      const current = requireGroup(report.groups[i]);
      if (previous.mixed !== current.mixed) {
        expect(previous.mixed).toBe(true); // mixed groups always come first
      } else if (previous.total !== current.total) {
        expect(previous.total).toBeGreaterThan(current.total);
      } else {
        expect(previous.id < current.id).toBe(true);
      }
    }
  });

  it('orders mixed groups before non-mixed ones even when the non-mixed total is larger', () => {
    // exclamation: not mixed, 3 occurrences. comma: mixed (`,` + `，`), 2 total.
    const report = analyzeSymbols('!!!,\uFF0C');

    expect(report.groups.map((group) => group.id)).toEqual(['comma', 'exclamation']);
    expect(groupOf(report, 'comma').mixed).toBe(true);
    expect(groupOf(report, 'comma').total).toBe(2);
    expect(groupOf(report, 'exclamation').mixed).toBe(false);
    expect(groupOf(report, 'exclamation').total).toBe(3);
  });

  it('is deterministic for repeated calls on the same input', () => {
    const text =
      '你好, 世界，测试。 (a) [b] {c} <d> "e" \'f\' -–—… ~/\\|@#$%&*+=_^`·「」《》【】';

    const first = analyzeSymbols(text);
    const second = analyzeSymbols(text);

    expect(second).toEqual(first);
    expect(second).not.toBe(first); // a fresh report object on every call
    expect(analyzeSymbols('')).toEqual(analyzeSymbols(''));
    expect(analyzeSymbols('a,b').total).toBe(1);
  });
});

describe('analyzeSymbols — larger input sanity', () => {
  it('keeps stable totals over a long mixed text', () => {
    const unit = '汉字，English. 标点！(test)\n';
    const text = unit.repeat(1_000);
    const report = analyzeSymbols(text);

    // Per unit: ， . ！ ( ) -> 5 symbol occurrences.
    expect(report.total).toBe(5_000);
    expect(report.empty).toBe(false);

    const t = tally(report);
    expect(t.size).toBe(5);
    expect(t.get(FULLWIDTH_COMMA)).toBe(1_000);
    expect(t.get('.')).toBe(1_000);
    expect(t.get('\uFF01')).toBe(1_000);
    expect(t.get('(')).toBe(1_000);
    expect(t.get(')')).toBe(1_000);

    expect(report.categories.reduce((sum, category) => sum + category.count, 0)).toBe(5_000);
    expect(groupOf(report, 'paren').total).toBe(2_000);
    // `(` and `)` both occur but they are the same category (half-width), so this is ordinary
    // ASCII parenthesis usage and must NOT be reported as a mixed form — otherwise every
    // English sentence would raise a false alarm.
    expect(groupOf(report, 'paren').mixed).toBe(false);
    expect(groupOf(report, 'exclamation').mixed).toBe(false); // only `！` occurs
  });

  it('skips unpaired surrogates without throwing', () => {
    const report = analyzeSymbols('a\uD83D,b\uDE42.');

    expect(report.total).toBe(2);
    expect(tally(report).get(',')).toBe(1);
    expect(tally(report).get('.')).toBe(1);
  });
});

describe('emoji are never reported as symbols', () => {
  it('ignores a skin-tone modifier attached to a base emoji', () => {
    const report = analyzeSymbols('\u{1F44D}\u{1F3FD}');
    expect(report.total).toBe(0);
    expect(report.empty).toBe(true);
    expect(classifySymbol('\u{1F3FD}')).toBeNull();
  });

  it('still counts a symbol standing next to an emoji', () => {
    const report = analyzeSymbols('\u{1F44D}\u{1F3FD},');
    expect(report.total).toBe(1);
    expect(tally(report).get(',')).toBe(1);
  });
});

describe('the half-width / full-width distinction drives `mixed`', () => {
  it('reports a half-width and a full-width colon as mixed', () => {
    expect(groupOf(analyzeSymbols(':'), 'colon').mixed).toBe(false);
    expect(groupOf(analyzeSymbols(':：'), 'colon').mixed).toBe(true);
  });

  it('reports a half-width and a full-width parenthesis as mixed', () => {
    expect(groupOf(analyzeSymbols('()'), 'paren').mixed).toBe(false);
    expect(groupOf(analyzeSymbols('(（'), 'paren').mixed).toBe(true);
    expect(groupOf(analyzeSymbols('(（)）'), 'paren').mixed).toBe(true);
  });

  it('never merges the three period forms', () => {
    const report = analyzeSymbols('.．。');
    const members = groupOf(report, 'period').members;
    expect(members.map((member) => member.char)).toEqual(['.', '\uFF0E', '\u3002']);
    expect(members.map((member) => member.count)).toEqual([1, 1, 1]);
    expect(members.map((member) => member.codePoint)).toEqual(['U+002E', 'U+FF0E', 'U+3002']);
    expect(groupOf(report, 'period').mixed).toBe(true);
  });
});

describe('the numeric fast-reject ranges stay symbol free', () => {
  const RANGES: readonly (readonly [number, number, string])[] = [
    [0x3400, 0x4dbf, 'CJK Ext A'],
    [0x4e00, 0x9fff, 'CJK Unified Ideographs'],
    [0xf900, 0xfaff, 'CJK Compatibility Ideographs'],
    [0x3041, 0x3096, 'Hiragana'],
    [0x30a1, 0x30fa, 'Katakana'],
    [0xac00, 0xd7a3, 'Hangul syllables'],
    [0x1100, 0x11ff, 'Hangul Jamo'],
    [0x0400, 0x04ff, 'Cyrillic'],
  ];

  it.each(RANGES)('contains no symbol in %s (%s)', (lo, hi) => {
    const offenders: string[] = [];
    for (let cp = lo; cp <= hi; cp++) {
      const char = String.fromCodePoint(cp);
      if (classifySymbol(char) !== null) offenders.push(`U+${cp.toString(16).toUpperCase()}`);
    }
    expect(offenders).toEqual([]);
  });

  it('still classifies the characters just outside those ranges', () => {
    expect(classifySymbol('\u30FB')).toBe('cjk'); // U+30FB katakana middle dot
    expect(classifySymbol('\u3001')).toBe('cjk'); // U+3001 ideographic comma
    expect(classifySymbol('\u3002')).toBe('cjk'); // U+3002 ideographic full stop
    expect(classifySymbol('\u060C')).toBe('other'); // U+060C Arabic comma
  });
});
