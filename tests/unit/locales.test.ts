import { describe, expect, test } from 'vitest';
import { createTranslator, LOCALES } from '../../src/locales';
import { zhCN, type MessageKey } from '../../src/locales/zh-CN';

describe('language catalogues', () => {
  for (const locale of LOCALES) {
    test(`${locale} preserves every message and interpolation parameter`, () => {
      const translate = createTranslator(locale);
      for (const key of Object.keys(zhCN) as MessageKey[]) {
        const translated = translate(key);
        expect(translated.trim(), key).not.toBe('');
        expect(translated, key).not.toBe(key);
        const parameters = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
        expect(parameters(translated), key).toEqual(parameters(zhCN[key]));
      }
      expect(translate('search.position', { index: 2, total: 9 })).toMatch(/2.*9/);
    });
  }
});
