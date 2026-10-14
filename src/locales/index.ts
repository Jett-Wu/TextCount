/**
 * Interface language wiring.
 *
 * Two languages, a flat dictionary and `{placeholder}` substitution — no i18n framework, in
 * line with the project's dependency budget. The selected language affects the interface only;
 * it never changes the counting rules.
 */

import { en } from './en';
import { zhCN, type MessageKey, type Messages } from './zh-CN';

export type LocaleId = 'zh-CN' | 'en';

export const LOCALES: readonly LocaleId[] = ['zh-CN', 'en'];

/** Native names, so the switcher is readable whatever the current language is. */
export const LOCALE_LABELS: Record<LocaleId, string> = {
  'zh-CN': '中文',
  en: 'English',
};

export const LOCALE_SHORT_LABELS: Record<LocaleId, string> = {
  'zh-CN': '中文',
  en: 'EN',
};

const DICTIONARIES: Record<LocaleId, Messages> = {
  'zh-CN': zhCN,
  en,
};

export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

const PLACEHOLDER = /\{(\w+)\}/g;

function format(template: string, params: Record<string, string | number> | undefined): string {
  if (params === undefined) return template;
  return template.replace(PLACEHOLDER, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole,
  );
}

export function createTranslator(locale: LocaleId): Translate {
  const dictionary = DICTIONARIES[locale] ?? DICTIONARIES.en;
  return (key, params) => format(dictionary[key] ?? zhCN[key] ?? key, params);
}

/** Language tag for `Intl.NumberFormat`. */
export function numberLocale(locale: LocaleId): string {
  return locale === 'zh-CN' ? 'zh-CN' : 'en-US';
}

export type { MessageKey, Messages };
