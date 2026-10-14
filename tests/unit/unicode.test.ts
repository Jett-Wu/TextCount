/**
 * Regression suite for the Unicode helpers.
 *
 * These functions decide what a "character" is, so the expectations here are deliberately
 * written in terms of concrete code points rather than copied from UI screenshots.
 */
import { describe, expect, it } from 'vitest';
import {
  codePointLength,
  countGraphemes,
  countGraphemesAndWhitespace,
  countWhitespaceCodePoints,
  isBlank,
  isLineBreakCodePoint,
  isWhitespace,
  utf16Length,
} from '../../src/core/unicode';

describe('code point and UTF-16 lengths', () => {
  it('distinguishes graphemes, code points and UTF-16 units for A🙂', () => {
    expect(codePointLength('A🙂')).toBe(2);
    expect(utf16Length('A🙂')).toBe(3);
    expect(countGraphemes('A🙂')).toBe(2);
  });

  it('handles lone surrogates without throwing', () => {
    expect(codePointLength('\uD83D')).toBe(1);
    expect(utf16Length('\uD83D')).toBe(1);
    expect(() => countGraphemes('a\uD83Db')).not.toThrow();
  });

  it('returns zero for the empty string', () => {
    expect(codePointLength('')).toBe(0);
    expect(utf16Length('')).toBe(0);
    expect(countGraphemes('')).toBe(0);
    expect(countGraphemesAndWhitespace('')).toEqual({ graphemes: 0, whitespace: 0 });
  });
});

describe('grapheme clusters', () => {
  it('collapses a ZWJ emoji sequence into one cluster', () => {
    expect(countGraphemes('\u{1F468}\u200D\u{1F469}\u200D\u{1F467}')).toBe(1);
  });

  it('collapses a flag into one cluster', () => {
    expect(countGraphemes('\u{1F1E8}\u{1F1F3}')).toBe(1);
  });

  it('collapses a skin-tone modifier into one cluster', () => {
    expect(countGraphemes('\u{1F44D}\u{1F3FD}')).toBe(1);
  });

  it('collapses a combining accent into one cluster', () => {
    expect(countGraphemes('e\u0301')).toBe(1);
  });

  it('collapses CRLF into one cluster', () => {
    expect(countGraphemes('a\r\nb')).toBe(3);
  });

  it('agrees with Intl.Segmenter on a mixed-script sample', () => {
    const sample = '中文 English 123 Привет 🙂 ក ក e\u0301 👨‍👩‍👧 🇨🇳 \u{20000}';
    const expected = [
      ...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(sample),
    ].length;
    expect(countGraphemes(sample)).toBe(expected);
  });

  it('is stable for text without any grapheme-joining characters', () => {
    const plain = '汉字 and plain words 12345';
    expect(countGraphemes(plain)).toBe(codePointLength(plain));
  });
});

describe('whitespace classification', () => {
  it('recognises common Unicode whitespace', () => {
    for (const char of [' ', '\t', '\n', '\r', '\u00A0', '\u3000', '\u2028', '\u2029', '\u1680']) {
      expect(isWhitespace(char)).toBe(true);
    }
  });

  it('rejects zero-width space and the BOM, which are format characters', () => {
    expect(isWhitespace('\u200B')).toBe(false);
    expect(isWhitespace('\uFEFF')).toBe(false);
  });

  it('rejects ordinary letters and punctuation', () => {
    expect(isWhitespace('a')).toBe(false);
    expect(isWhitespace('，')).toBe(false);
  });

  it('is not affected by repeated calls (no sticky state leaks)', () => {
    expect(isWhitespace(' ')).toBe(true);
    expect(isWhitespace('a')).toBe(false);
    expect(isWhitespace(' ')).toBe(true);
  });

  it('counts whitespace code points', () => {
    expect(countWhitespaceCodePoints(' a\tb\u00A0c ')).toBe(4);
    expect(countWhitespaceCodePoints('abc')).toBe(0);
  });

  it('reports the whitespace grapheme subset consistently', () => {
    const counts = countGraphemesAndWhitespace('你好\u3000世界\n\n');
    expect(counts.whitespace).toBe(3);
    expect(counts.graphemes).toBe(7);
  });
});

describe('blank detection', () => {
  it('treats empty and whitespace-only text as blank', () => {
    expect(isBlank('')).toBe(true);
    expect(isBlank('   \n\t ')).toBe(true);
    expect(isBlank('\u3000')).toBe(true);
  });

  it('treats any content as non-blank', () => {
    expect(isBlank('a')).toBe(false);
    expect(isBlank(' 。 ')).toBe(false);
  });
});

describe('line break recognition', () => {
  it('accepts LF, CR, LS and PS', () => {
    expect([0x0a, 0x0d, 0x2028, 0x2029].every(isLineBreakCodePoint)).toBe(true);
  });

  it('rejects other whitespace', () => {
    expect([0x09, 0x20, 0xa0, 0x3000].some(isLineBreakCodePoint)).toBe(false);
  });
});
