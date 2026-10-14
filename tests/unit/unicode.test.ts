/**
 * Unicode helper regression tests. Expectations are written in terms of concrete code points,
 * not copied from anything a screen showed.
 */
import { describe, expect, it } from 'vitest';
import {
  codePointLength,
  countGraphemesAndWhitespace,
  countWhitespaceCodePoints,
} from '../../src/core/unicode';

describe('code point length', () => {
  it('distinguishes code points from UTF-16 code units', () => {
    expect(codePointLength('A🙂')).toBe(2);
    expect('A🙂'.length).toBe(3);
  });

  it('handles lone surrogates without throwing', () => {
    expect(codePointLength('\uD83D')).toBe(1);
    expect(codePointLength('a\uD83Db')).toBe(3);
  });

  it('returns zero for the empty string', () => {
    expect(codePointLength('')).toBe(0);
  });
});

describe('grapheme clusters', () => {
  it('collapses joined sequences into one cluster', () => {
    expect(countGraphemesAndWhitespace('\u{1F468}\u200D\u{1F469}\u200D\u{1F467}').graphemes).toBe(1);
    expect(countGraphemesAndWhitespace('\u{1F1E8}\u{1F1F3}').graphemes).toBe(1);
    expect(countGraphemesAndWhitespace('\u{1F44D}\u{1F3FD}').graphemes).toBe(1);
    expect(countGraphemesAndWhitespace('e\u0301').graphemes).toBe(1);
    expect(countGraphemesAndWhitespace('a\r\nb').graphemes).toBe(3);
  });

  it('agrees with Intl.Segmenter on a mixed-script sample', () => {
    const sample = '中文 English 123 Привет 🙂 ក ក e\u0301 👨‍👩‍👧 🇨🇳 \u{20000}';
    const expected = [
      ...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(sample),
    ].length;
    expect(countGraphemesAndWhitespace(sample).graphemes).toBe(expected);
  });

  it('returns zero for the empty string', () => {
    expect(countGraphemesAndWhitespace('')).toEqual({ graphemes: 0, whitespace: 0 });
  });

  it('uses the code point count as a fast path when nothing can join', () => {
    const plain = '汉字 and plain words 12345';
    expect(countGraphemesAndWhitespace(plain).graphemes).toBe(codePointLength(plain));
  });
});

describe('whitespace', () => {
  it('covers the Unicode white space set', () => {
    expect(countWhitespaceCodePoints(' a\tb\u00A0c\u3000d ')).toBe(5);
    expect(countWhitespaceCodePoints('abc')).toBe(0);
  });

  it('does not treat zero-width space or the BOM as whitespace', () => {
    expect(countWhitespaceCodePoints('a\u200Bb')).toBe(0);
    expect(countWhitespaceCodePoints('a\uFEFFb')).toBe(0);
  });

  it('reports the whitespace subset consistently with the total', () => {
    const counts = countGraphemesAndWhitespace('你好\u3000世界\n\n');
    expect(counts.whitespace).toBe(3);
    expect(counts.graphemes).toBe(7);
  });
});
