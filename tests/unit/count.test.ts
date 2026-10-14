/**
 * Regression suite for the counting rules.
 *
 * Each case encodes an input, an expected output and the rule that explains it: the samples
 * from section 12.2 of the design reference, plus the boundaries the implementation depends on.
 * A failure here means the rule changed — update `src/core/count.ts`, the locale wording and
 * this file together, never this file alone.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COUNT_SETTINGS,
  EMPTY_STATS,
  analyzeText,
  type CountSettings,
} from '../../src/core/count';

function run(text: string, overrides: Partial<CountSettings> = {}) {
  return analyzeText(text, { ...DEFAULT_COUNT_SETTINGS, ...overrides });
}

describe('empty and whitespace-only input', () => {
  it('returns zeros and never NaN for empty text', () => {
    const stats = run('');
    expect(stats).toEqual({ ...EMPTY_STATS, primaryMetric: 'mixed' });
    for (const value of Object.values(stats)) {
      if (typeof value === 'number') expect(Number.isNaN(value)).toBe(false);
    }
  });

  it('treats whitespace-only text as zero words but keeps the character count', () => {
    const stats = run(' \t\n  ');
    expect(stats.mixed).toBe(0);
    expect(stats.han).toBe(0);
    expect(stats.latinWords).toBe(0);
    expect(stats.punctuation).toBe(0);
    expect(stats.paragraphs).toBe(0);
    expect(stats.whitespace).toBe(stats.graphemes);
    expect(stats.graphemesNoWhitespace).toBe(0);
  });

  it('does not count blank lines as paragraphs', () => {
    expect(run('a\n\n\nb').paragraphs).toBe(2);
    expect(run('a\n\n\nb').lines).toBe(4);
    expect(run('\n\n\n').paragraphs).toBe(0);
  });
});

describe('the documented mixed-metric example', () => {
  it('counts 你好 AI 2026 as 4 mixed units and 10 grapheme characters', () => {
    const stats = run('你好 AI 2026');
    expect(stats.han).toBe(2);
    expect(stats.latinWords).toBe(1);
    expect(stats.digitRuns).toBe(1);
    expect(stats.mixed).toBe(4);
    expect(stats.primary).toBe(4);
    expect(stats.graphemes).toBe(10);
    expect(stats.graphemesNoWhitespace).toBe(8);
    expect(stats.whitespace).toBe(2);
    expect(stats.utf16Length).toBe(10);
  });
});

describe('grapheme clusters versus UTF-16 code units', () => {
  it('counts A🙂 as 2 characters and 3 UTF-16 code units', () => {
    const stats = run('A🙂');
    expect(stats.graphemes).toBe(2);
    expect(stats.utf16Length).toBe(3);
    expect(stats.codePoints).toBe(2);
    expect(stats.latinWords).toBe(1);
    expect(stats.mixed).toBe(1);
  });

  it('treats a ZWJ family emoji as one user-perceived character', () => {
    const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
    const stats = run(family);
    expect(stats.graphemes).toBe(1);
    expect(stats.utf16Length).toBe(8);
    expect(stats.codePoints).toBe(5);
    expect(stats.mixed).toBe(0);
    expect(stats.graphemesNoWhitespace).toBe(1);
  });

  it('treats a regional-indicator flag as one user-perceived character', () => {
    const stats = run('\u{1F1E8}\u{1F1F3}');
    expect(stats.graphemes).toBe(1);
    expect(stats.utf16Length).toBe(4);
  });

  it('treats a skin-tone modified emoji as one user-perceived character', () => {
    const stats = run('\u{1F44D}\u{1F3FD}');
    expect(stats.graphemes).toBe(1);
    expect(stats.utf16Length).toBe(4);
  });

  it('treats CRLF as a single logical line break', () => {
    const stats = run('a\r\nb');
    expect(stats.lines).toBe(2);
    expect(stats.paragraphs).toBe(2);
    expect(stats.latinWords).toBe(2);
    expect(stats.graphemes).toBe(3);
    expect(stats.graphemesNoWhitespace).toBe(2);
  });

  it('treats a lone CR and a lone LF as one line break each', () => {
    expect(run('a\rb').lines).toBe(2);
    expect(run('a\nb').lines).toBe(2);
    expect(run('a\nb').paragraphs).toBe(2);
  });

  it('counts non-breaking space as whitespace', () => {
    const stats = run('a\u00A0b');
    expect(stats.whitespace).toBe(1);
    expect(stats.graphemesNoWhitespace).toBe(2);
    expect(stats.latinWords).toBe(2);
  });

  it('counts the ideographic space as whitespace', () => {
    const stats = run('你好\u3000世界');
    expect(stats.whitespace).toBe(1);
    expect(stats.graphemes).toBe(5);
    expect(stats.han).toBe(4);
  });

  it('does not treat zero-width space as whitespace (it is a format character)', () => {
    const stats = run('a\u200Bb');
    expect(stats.whitespace).toBe(0);
    expect(stats.graphemes).toBe(3);
  });
});

describe('Han characters', () => {
  it('counts CJK extension B ideographs, which live outside the BMP', () => {
    const stats = run('\u{20000}\u{20001}');
    expect(stats.han).toBe(2);
    expect(stats.graphemes).toBe(2);
    expect(stats.utf16Length).toBe(4);
  });

  it('counts the ideographic number zero and the iteration mark as Han', () => {
    expect(run('\u3007').han).toBe(1);
    expect(run('\u3005').han).toBe(1);
  });

  it('never counts CJK punctuation as Han characters', () => {
    const stats = run('、。！？；：');
    expect(stats.han).toBe(0);
    expect(stats.punctuation).toBe(6);
    expect(stats.mixed).toBe(0);
  });

  it('counts a run of Chinese text one unit per character', () => {
    expect(run('今天天气很好').han).toBe(6);
    expect(run('今天天气很好').mixed).toBe(6);
  });
});

describe('Latin words, digits and other scripts', () => {
  it('keeps apostrophes and hyphens inside a word', () => {
    const stats = run("don't well-known users'");
    expect(stats.latinWords).toBe(3);
  });

  it('counts a decimal number and a thousands separator as one digit run each', () => {
    expect(run('3.14').digitRuns).toBe(1);
    expect(run('1,000').digitRuns).toBe(1);
    expect(run('1.2.3').digitRuns).toBe(1);
    expect(run('12 34').digitRuns).toBe(2);
    expect(run('1.').digitRuns).toBe(1);
    expect(run('1.').punctuation).toBe(1);
  });

  it('extends a digit run across full-width digits', () => {
    expect(run('１２３').digitRuns).toBe(1);
  });

  it('handles accented Latin text as single words', () => {
    const stats = run('café naïve');
    expect(stats.latinWords).toBe(2);
  });

  it('counts full-width Latin letters as Latin words', () => {
    expect(run('ＡＢＣ').latinWords).toBe(1);
  });

  it('counts other letter-based scripts as space-separated words', () => {
    const stats = run('Привет мир Ελληνικά');
    expect(stats.otherWords).toBe(3);
    expect(stats.latinWords).toBe(0);
    expect(stats.mixed).toBe(3);
  });

  it('counts Hangul runs as words rather than per syllable', () => {
    expect(run('안녕하세요 세계').otherWords).toBe(2);
  });

  it('counts kana one unit per character', () => {
    const stats = run('ひらがなカタカナ');
    expect(stats.kana).toBe(8);
    expect(stats.mixed).toBe(8);
  });

  it('keeps the character total correct for a mixed-script document', () => {
    const text = '中文 English 123 Привет 🙂';
    const stats = run(text);
    expect(stats.han).toBe(2);
    expect(stats.latinWords).toBe(1);
    expect(stats.digitRuns).toBe(1);
    expect(stats.otherWords).toBe(1);
    expect(stats.graphemes).toBe([...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length);
  });
});

describe('punctuation and symbols', () => {
  it('counts only Unicode category P as punctuation', () => {
    const stats = run('，。！？；：,.;:!?');
    expect(stats.punctuation).toBe(12);
    expect(stats.mixed).toBe(0);
  });

  it('does not treat currency or maths symbols as punctuation', () => {
    const stats = run('$ € + = ©');
    expect(stats.punctuation).toBe(0);
    expect(stats.mixed).toBe(0);
    expect(stats.graphemesNoWhitespace).toBe(5);
  });

  it('does not count emoji as punctuation or as words', () => {
    const stats = run('hello 🙂 world');
    expect(stats.punctuation).toBe(0);
    expect(stats.latinWords).toBe(2);
    expect(stats.mixed).toBe(2);
  });
});

describe('prose sample with Chinese punctuation', () => {
  const text = '他说：“今天天气很好。”然后离开了。';
  //    他会说 ：“今天天气很好。”然后离开了。
  it('counts Han, punctuation and mixed units consistently', () => {
    const stats = run(text);
    expect(stats.han).toBe(13);
    expect(stats.punctuation).toBe(5);
    expect(stats.mixed).toBe(13);
    expect(stats.mixed).toBeLessThan(stats.graphemes);
  });
});

describe('rule switching', () => {
  const text = '你好 AI 2026';

  it('never changes the character counts when the primary metric changes', () => {
    const base = run(text);
    for (const primaryMetric of ['han', 'latinWords', 'charsNoSpace'] as const) {
      const switched = run(text, { primaryMetric });
      expect(switched.graphemes).toBe(base.graphemes);
      expect(switched.mixed).toBe(base.mixed);
      expect(switched.han).toBe(base.han);
      expect(switched.latinWords).toBe(base.latinWords);
    }
  });

  it('selects the documented headline number for each metric', () => {
    expect(run(text, { primaryMetric: 'mixed' }).primary).toBe(4);
    expect(run(text, { primaryMetric: 'han' }).primary).toBe(2);
    expect(run(text, { primaryMetric: 'latinWords' }).primary).toBe(1);
    expect(run(text, { primaryMetric: 'charsNoSpace' }).primary).toBe(8);
  });

  it('honours the digit-run and punctuation switches', () => {
    expect(run('a1', { countDigitRuns: false }).mixed).toBe(1);
    expect(run('a1', { countDigitRuns: true }).mixed).toBe(2);
    expect(run('你好。', { countPunctuation: true }).mixed).toBe(3);
    expect(run('你好。', { countPunctuation: false }).mixed).toBe(2);
  });
});

describe('large input is counted exactly and never truncated', () => {
  it('counts a one-million-character single line without sampling', () => {
    const unit = '汉字abc123';
    const repeats = Math.ceil(1_000_000 / unit.length);
    const text = unit.repeat(repeats).slice(0, 1_000_000);
    const stats = run(text);

    expect(stats.utf16Length).toBe(1_000_000);
    expect(stats.graphemes).toBe(1_000_000);
    expect(stats.lines).toBe(1);
    expect(stats.paragraphs).toBe(1);
    // Every 8-character unit contributes 2 Han, 1 Latin word and 1 digit run.
    expect(stats.han + stats.latinWords + stats.digitRuns).toBeGreaterThanOrEqual(
      Math.floor(1_000_000 / unit.length) * 4,
    );
    expect(stats.mixed).toBeGreaterThan(400_000);
  });

  it('counts a document with a very large number of lines', () => {
    const text = 'line\n'.repeat(50_000);
    const stats = run(text);
    expect(stats.lines).toBe(50_001);
    expect(stats.paragraphs).toBe(50_000);
    expect(stats.latinWords).toBe(50_000);
  });

  it('is deterministic across repeated runs', () => {
    const text = '中文 English 123，。！🙂\n第二段';
    expect(run(text)).toEqual(run(text));
  });
});
