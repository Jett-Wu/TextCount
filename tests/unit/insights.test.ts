import { describe, expect, it } from 'vitest';
import { analyzeFrequency, analyzeParagraphs } from '../../src/core/insights';

/** Every number an empty document produces must be a real zero, never `NaN`. */
function isEmpty(value: unknown): boolean {
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'number') return value === 0;
  return false;
}

describe('paragraphs', () => {
  it('reports nothing for empty text', () => {
    const report = analyzeParagraphs('');
    expect(report).toEqual({
      count: 0,
      blankLines: 0,
      average: 0,
      median: 0,
      longest: 0,
      paragraphs: [],
      truncated: false,
    });
    for (const value of Object.values(report)) expect(isEmpty(value)).toBe(true);
  });

  it('separates paragraphs on a blank line and addresses the original string', () => {
    const report = analyzeParagraphs('a\n\nb');
    expect(report.count).toBe(2);
    expect(report.blankLines).toBe(1);
    expect(report.average).toBe(1);
    expect(report.median).toBe(1);
    expect(report.longest).toBe(1);
    expect(report.truncated).toBe(false);
    expect(report.paragraphs).toEqual([
      { index: 0, start: 0, end: 1, graphemes: 1, charsNoSpace: 1 },
      { index: 1, start: 3, end: 4, graphemes: 1, charsNoSpace: 1 },
    ]);
  });

  it('treats CRLF as a single break', () => {
    const report = analyzeParagraphs('a\r\nb');
    expect(report.count).toBe(2);
    expect(report.blankLines).toBe(0);
    expect(report.paragraphs).toEqual([
      { index: 0, start: 0, end: 1, graphemes: 1, charsNoSpace: 1 },
      { index: 1, start: 3, end: 4, graphemes: 1, charsNoSpace: 1 },
    ]);
  });

  it('counts a whitespace-only line as blank rather than as a paragraph', () => {
    const report = analyzeParagraphs('a\n \t \nb');
    expect(report.count).toBe(2);
    expect(report.blankLines).toBe(1);
    expect(report.paragraphs).toEqual([
      { index: 0, start: 0, end: 1, graphemes: 1, charsNoSpace: 1 },
      { index: 1, start: 6, end: 7, graphemes: 1, charsNoSpace: 1 },
    ]);
  });

  it('separates paragraphs on the Unicode line separators', () => {
    const report = analyzeParagraphs('a\u2028b\u2029c\rd');
    expect(report.count).toBe(4);
    expect(report.blankLines).toBe(0);
    expect(report.paragraphs.map((paragraph) => paragraph.start)).toEqual([0, 2, 4, 6]);
  });

  it('computes the median as the lower middle for an even count', () => {
    const report = analyzeParagraphs('a\nbb\nccc\ndddd');
    expect(report.count).toBe(4);
    expect(report.median).toBe(2);
    expect(report.average).toBe(2.5);
    expect(report.longest).toBe(4);
  });

  it('computes the median as the middle value for an odd count', () => {
    const report = analyzeParagraphs('a\nbb\nccccc');
    expect(report.count).toBe(3);
    expect(report.median).toBe(2);
    expect(report.average).toBe(8 / 3);
    expect(report.longest).toBe(5);
  });

  it('caps the returned paragraphs but keeps describing every paragraph', () => {
    const report = analyzeParagraphs('a\n' + 'bb\n'.repeat(4) + 'bbb', { maxParagraphs: 2 });
    expect(report.truncated).toBe(true);
    expect(report.paragraphs.length).toBe(2);
    expect(report.count).toBe(6);
    expect(report.average).toBe(2);
    expect(report.median).toBe(2);
    expect(report.longest).toBe(3);
    expect(report.paragraphs.map((paragraph) => paragraph.start)).toEqual([0, 2]);
  });

  it('does not claim truncation when every paragraph is retained', () => {
    const report = analyzeParagraphs('a\nbb\nccc');
    expect(report.count).toBe(3);
    expect(report.paragraphs.length).toBe(3);
    expect(report.truncated).toBe(false);
  });

  it('counts graphemes and whitespace inside a paragraph', () => {
    const report = analyzeParagraphs('  a b\nc');
    expect(report.count).toBe(2);
    expect(report.blankLines).toBe(0);
    expect(report.paragraphs).toEqual([
      { index: 0, start: 0, end: 5, graphemes: 5, charsNoSpace: 2 },
      { index: 1, start: 6, end: 7, graphemes: 1, charsNoSpace: 1 },
    ]);
    expect(report.average).toBe(3);
    expect(report.median).toBe(1);
    expect(report.longest).toBe(5);
  });

  it('survives lone surrogates', () => {
    const report = analyzeParagraphs('a\uD83Db');
    expect(report.count).toBe(1);
    expect(report.paragraphs[0]?.start).toBe(0);
    expect(report.paragraphs[0]?.end).toBe(3);
    expect(report.paragraphs[0]?.graphemes).toBe(3);
    expect(report.paragraphs[0]?.charsNoSpace).toBe(3);
  });
});

describe('frequency', () => {
  it('reports nothing for empty text', () => {
    for (const unit of ['word', 'character'] as const) {
      const report = analyzeFrequency('', { unit });
      expect(report.totalTokens).toBe(0);
      expect(report.distinct).toBe(0);
      expect(report.entries).toEqual([]);
      expect(report.truncated).toBe(false);
      expect(report.degraded).toBe(false);
    }
  });

  it('filters stop words by default', () => {
    const report = analyzeFrequency('the cat and the dog');
    expect(report.totalTokens).toBe(5);
    expect(report.distinct).toBe(2);
    expect(report.entries).toEqual([
      { term: 'cat', count: 1 },
      { term: 'dog', count: 1 },
    ]);
    expect(report.truncated).toBe(false);
    expect(report.degraded).toBe(false);
  });

  it('keeps stop words when asked to', () => {
    const report = analyzeFrequency('the cat and the dog', { filterStopWords: false });
    expect(report.totalTokens).toBe(5);
    expect(report.distinct).toBe(4);
    expect(report.entries[0]).toEqual({ term: 'the', count: 2 });
    expect(report.entries).toEqual([
      { term: 'the', count: 2 },
      { term: 'and', count: 1 },
      { term: 'cat', count: 1 },
      { term: 'dog', count: 1 },
    ]);
  });

  it('folds Latin case into a single term', () => {
    const report = analyzeFrequency("Don't don't DON'T");
    expect(report.totalTokens).toBe(3);
    expect(report.distinct).toBe(1);
    expect(report.entries).toEqual([{ term: "don't", count: 3 }]);
    expect(report.truncated).toBe(false);
  });

  it('drops decimal-digit tokens unless asked to keep them', () => {
    const dropped = analyzeFrequency('2026 cat a year');
    expect(dropped.totalTokens).toBe(4);
    expect(dropped.distinct).toBe(2);
    expect(dropped.entries).toEqual([
      { term: 'cat', count: 1 },
      { term: 'year', count: 1 },
    ]);
    expect(dropped.entries.some((entry) => entry.term === '2026')).toBe(false);

    const kept = analyzeFrequency('2026 cat a year', { excludeNumbers: false });
    expect(kept.totalTokens).toBe(4);
    expect(kept.distinct).toBe(3);
    expect(kept.entries.map((entry) => entry.term)).toEqual(['2026', 'cat', 'year']);
  });

  it('treats anything without a letter as a number, not a word', () => {
    // `0.7` and `1,000` come back from the segmenter as single word-like tokens, so a pure-digit
    // test would leave them sitting in a word ranking beside real words.
    const report = analyzeFrequency('0.7 1,000 12 cat');
    expect(report.entries.map((entry) => entry.term)).toEqual(['cat']);
    expect(report.distinct).toBe(1);
  });

  it('drops single-character terms from the word ranking', () => {
    /*
     * On real Chinese prose ICU returns fragments alongside words — 法 from 四阶段法, 客 from
     * 客流, 性 from 准确性 — and because those characters are frequent they outrank the actual
     * words. Measured on a 640-character article before this rule existed, the top seven were
     * 法/预测/方法/客/类/流: three fragments among the four highest. Spaces here force the
     * segmentation so the expectation is exact.
     */
    const report = analyzeFrequency('法 方法 方法');
    expect(report.entries).toEqual([{ term: '方法', count: 2 }]);
    expect(report.distinct).toBe(1);
    // Filtered tokens are still counted as tokens; only the ranking excludes them.
    expect(report.totalTokens).toBe(3);
  });

  it('keeps single characters when the caller asks for them', () => {
    const report = analyzeFrequency('法 方法 方法', { minTermLength: 1 });
    expect(report.entries.map((entry) => entry.term)).toEqual(['方法', '法']);
    expect(report.distinct).toBe(2);
  });

  it('does not flag Chinese text as degraded just because engines differ', () => {
    /*
     * Segmentation quality varies by engine — Firefox splits 工具 into two fragments and merges
     * 对上原文 into 上原 — but that is not a failure the module can detect, so `degraded` must stay
     * false. It means only "Intl.Segmenter was missing or threw", which is a different claim.
     */
    expect(analyzeFrequency('这是一个工具').degraded).toBe(false);
    expect(analyzeFrequency('这是一个工具', { unit: 'character' }).degraded).toBe(false);
    expect(analyzeFrequency('the cat sat').degraded).toBe(false);
  });

  it('counts every Chinese segment in the whole text, not a sample of it', () => {
    const report = analyzeFrequency('这是一个工具，这是一个小工具。');
    expect(report.degraded).toBe(false);
    // Nine word-like segments in total; the ranking keeps only the two-character one, because a
    // single character is a candidate fragment and belongs to the 'character' unit instead.
    expect(report.totalTokens).toBe(9);
    expect(report.entries).toEqual([{ term: '工具', count: 2 }]);
    expect(report.distinct).toBe(1);

    // The same text under the character unit reports the single characters that word mode drops.
    const characters = analyzeFrequency('这是一个工具，这是一个小工具。', { unit: 'character' });
    expect(characters.entries.map((entry) => entry.term)).toContain('小');
    expect(characters.entries.map((entry) => entry.term)).toContain('工');
  });

  it('counts Han and Kana characters only when the unit is character', () => {
    const report = analyzeFrequency('汉字汉字abc123', { unit: 'character' });
    expect(report.unit).toBe('character');
    expect(report.totalTokens).toBe(4);
    expect(report.distinct).toBe(2);
    expect(report.entries).toEqual([
      // Equal counts tie-break by code point (字 U+5B57 before 汉 U+6C49), never by the host's
      // collation — a zh-CN machine would otherwise order these by pinyin and this test would
      // pass locally while failing on CI.
      { term: '字', count: 2 },
      { term: '汉', count: 2 },
    ]);
    expect(report.entries.some((entry) => /[a-z0-9]/i.test(entry.term))).toBe(false);
  });

  it('caps the entries but still reports the true number of distinct terms', () => {
    const words: string[] = [];
    for (let index = 0; index < 900; index++) words.push(`term${index}`);
    const text = words.join(' ');
    const truncated = analyzeFrequency(text, { maxEntries: 3 });
    expect(truncated.distinct).toBe(900);
    expect(truncated.entries.length).toBe(3);
    expect(truncated.truncated).toBe(true);
    expect(truncated.totalTokens).toBe(900);

    const whole = analyzeFrequency(text);
    expect(whole.distinct).toBe(900);
    expect(whole.entries.length).toBe(200);
    expect(whole.truncated).toBe(true);
  });

  it('is deterministic and breaks ties by term ascending', () => {
    const text = 'zeta alpha beta alpha gamma beta alpha';
    const first = analyzeFrequency(text, { filterStopWords: false });
    const second = analyzeFrequency(text, { filterStopWords: false });
    expect(first).toEqual(second);
    expect(first.distinct).toBe(4);
    expect(first.entries).toEqual([
      { term: 'alpha', count: 3 },
      { term: 'beta', count: 2 },
      { term: 'gamma', count: 1 },
      { term: 'zeta', count: 1 },
    ]);
    for (let index = 1; index < first.entries.length; index++) {
      const previous = first.entries[index - 1];
      const current = first.entries[index];
      if (previous !== undefined && current !== undefined && previous.count === current.count) {
        expect(previous.term.localeCompare(current.term)).toBeLessThan(0);
      }
    }
  });

  it('counts a 200000-character document exactly', () => {
    const text = `${'alpha '.repeat(25_000)}${'the '.repeat(12_500)}`;
    const report = analyzeFrequency(text);
    expect(text.length).toBe(200_000);
    expect(report.totalTokens).toBe(37_500);
    expect(report.distinct).toBe(1);
    expect(report.entries).toEqual([{ term: 'alpha', count: 25_000 }]);
    expect(report.degraded).toBe(false);
  });

  it('describes every paragraph of a 32000-paragraph document', () => {
    const text = 'alpha\n'.repeat(32_000);
    const report = analyzeParagraphs(text);
    expect(text.length).toBe(192_000);
    expect(report.count).toBe(32_000);
    // Nothing follows the last break, so there is no trailing line to call blank.
    expect(report.blankLines).toBe(0);
    expect(report.longest).toBe(5);
    expect(report.average).toBe(5);
    expect(report.median).toBe(5);
    expect(report.truncated).toBe(true);
    expect(report.paragraphs.length).toBe(2000);
    expect(report.paragraphs[1999]).toEqual({
      index: 1999,
      start: 11_994,
      end: 11_999,
      graphemes: 5,
      charsNoSpace: 5,
    });
  });

  // Last, because it replaces a prototype method for the rest of the file.
  it('falls back to the regex tokenizer when the segmenter throws on a text', () => {
    const original = Intl.Segmenter.prototype.segment;
    try {
      Intl.Segmenter.prototype.segment = function segment(): never {
        throw new RangeError('segmentation failed');
      };
      const report = analyzeFrequency('the cat and the dog');
      expect(report.degraded).toBe(true);
      expect(report.totalTokens).toBe(5);
      expect(report.distinct).toBe(2);
      expect(report.entries).toEqual([
        { term: 'cat', count: 1 },
        { term: 'dog', count: 1 },
      ]);
    } finally {
      Intl.Segmenter.prototype.segment = original;
    }
  });
});
