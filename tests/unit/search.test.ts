/**
 * Regression suite for literal search.
 *
 * The important guarantees: non-overlapping matching, exact full-document counts, literal
 * (never normalised) matching, and offsets that stay valid against the *original* string even
 * in case-insensitive mode.
 */
import { describe, expect, it } from 'vitest';
import { contextAround, findMatches, findMatchesMany } from '../../src/core/search';

describe('literal, non-overlapping matching', () => {
  it('finds aa twice in aaaa', () => {
    const result = findMatches('aaaa', 'aa');
    expect(result.count).toBe(2);
    expect(result.positions).toEqual([0, 2]);
    expect(result.truncated).toBe(false);
  });

  it('never merges a half-width comma with a full-width comma', () => {
    const text = 'a,b，c';
    expect(findMatches(text, ',').count).toBe(1);
    expect(findMatches(text, '，').count).toBe(1);
    expect(findMatches(text, ',').positions).toEqual([1]);
    expect(findMatches(text, '，').positions).toEqual([3]);
  });

  it('never merges 。 with . or ．', () => {
    const text = 'a.b．c。d';
    expect(findMatches(text, '.').count).toBe(1);
    expect(findMatches(text, '．').count).toBe(1);
    expect(findMatches(text, '。').count).toBe(1);
  });

  it('returns a zero result for text that does not contain the term', () => {
    const result = findMatches('hello world', 'xyz');
    expect(result.count).toBe(0);
    expect(result.positions).toEqual([]);
    expect(result.truncated).toBe(false);
  });

  it('returns a zero result for an empty term without throwing', () => {
    expect(findMatches('abc', '').count).toBe(0);
    expect(findMatches('', 'a').count).toBe(0);
    expect(findMatches('a', 'ab').count).toBe(0);
  });

  it('finds Chinese phrases and punctuation', () => {
    const text = '今天天气很好，明天天气也很好。';
    expect(findMatches(text, '天气').count).toBe(2);
    expect(findMatches(text, '天气').positions).toEqual([2, 9]);
    expect(findMatches(text, '，').count).toBe(1);
  });

  it('finds an emoji term at a surrogate-pair boundary', () => {
    const text = 'a🙂b🙂';
    const result = findMatches(text, '🙂');
    expect(result.count).toBe(2);
    expect(result.positions).toEqual([1, 4]);
    expect(result.lengths).toEqual([2, 2]);
  });

  it('counts overlapping occurrences only once per non-overlapping step', () => {
    expect(findMatches('ababab', 'abab').count).toBe(1);
    expect(findMatches('ababab', 'abab').positions).toEqual([0]);
  });
});

describe('case handling', () => {
  const text = 'Text text TEXT';

  it('is case-sensitive by default', () => {
    expect(findMatches(text, 'Text').count).toBe(1);
    expect(findMatches(text, 'Text').positions).toEqual([0]);
  });

  it('matches every casing when case sensitivity is off', () => {
    const result = findMatches(text, 'text', { caseSensitive: false });
    expect(result.count).toBe(3);
    expect(result.positions).toEqual([0, 5, 10]);
  });

  it('reports offsets that address the original string, not a lower-cased copy', () => {
    // `İ`.toLowerCase() is two code units, so a lower-cased haystack would shift every later
    // offset. The implementation must not be affected by that.
    const tricky = 'İİ ABC abc';
    const result = findMatches(tricky, 'abc', { caseSensitive: false });
    expect(result.count).toBe(2);
    for (const [index, position] of result.positions.entries()) {
      const length = result.lengths[index] ?? 0;
      expect(tricky.slice(position, position + length).toLowerCase()).toBe('abc');
    }
  });

  it('keeps the matched length when case folding changes it', () => {
    const text = 'Straße STRASSE';
    const result = findMatches(text, 'straße', { caseSensitive: false });
    expect(result.count).toBe(1);
    expect(text.slice(result.positions[0] ?? 0, (result.positions[0] ?? 0) + (result.lengths[0] ?? 0))).toBe(
      'Straße',
    );
  });

  it('treats regex metacharacters in the term as literals', () => {
    const text = 'a.b aXb a.b';
    expect(findMatches(text, 'a.b', { caseSensitive: false }).count).toBe(2);
    expect(findMatches('price ($5)', '($5)', { caseSensitive: false }).count).toBe(1);
    expect(findMatches('a+b', 'a+b').count).toBe(1);
  });
});

describe('bounded position retention', () => {
  it('keeps the full count while retaining only maxPositions entries', () => {
    const text = 'a'.repeat(1000);
    const result = findMatches(text, 'a', { maxPositions: 10 });
    expect(result.count).toBe(1000);
    expect(result.positions).toHaveLength(10);
    expect(result.lengths).toHaveLength(10);
    expect(result.truncated).toBe(true);
  });

  it('is not truncated when every match fits', () => {
    const result = findMatches('aaaa', 'aa', { maxPositions: 10 });
    expect(result.truncated).toBe(false);
  });

  it('handles a one-million-character text with a very high match count', () => {
    const text = 'a'.repeat(1_000_000);
    const result = findMatches(text, 'a');
    expect(result.count).toBe(1_000_000);
    expect(result.positions).toHaveLength(500);
    expect(result.truncated).toBe(true);
  });

  it('counts across chunk boundaries without splitting a match', () => {
    const text = `${'x'.repeat(9_999)}needle${'y'.repeat(9_999)}`;
    const result = findMatches(text, 'needle');
    expect(result.count).toBe(1);
    expect(result.positions).toEqual([9_999]);
  });
});

describe('multiple terms', () => {
  it('reports each term independently', () => {
    const text = '旧名称 新名称 旧名称';
    const results = findMatchesMany(text, ['旧名称', '新名称', '不存在']);
    expect(results.map((entry) => entry.count)).toEqual([2, 1, 0]);
    expect(results.map((entry) => entry.term)).toEqual(['旧名称', '新名称', '不存在']);
  });
});

describe('match context excerpts', () => {
  it('returns the matched text and its surroundings', () => {
    const text = '0123456789 MATCH 0123456789';
    const context = contextAround(text, 11, 5, 4);
    expect(context.match).toBe('MATCH');
    expect(context.before).toBe('789 ');
    expect(context.after).toBe(' 012');
    expect(context.truncatedBefore).toBe(true);
    expect(context.truncatedAfter).toBe(true);
  });

  it('does not cut a surrogate pair in half', () => {
    const text = 'a🙂b🙂c🙂d';
    const context = contextAround(text, 5, 2, 1);
    // Every emitted fragment must round-trip through UTF-16 without a lone surrogate.
    for (const fragment of [context.before, context.match, context.after]) {
      expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(fragment)).toBe(
        false,
      );
    }
  });

  it('clamps offsets outside the text', () => {
    const context = contextAround('abc', 99, 99, 5);
    expect(context.match).toBe('');
    expect(context.before).toBe('abc');
    expect(context.after).toBe('');
  });
});
