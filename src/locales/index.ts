/**
 * Interface language wiring.
 *
 * Flat dictionaries and `{placeholder}` substitution — no i18n framework, in
 * line with the project's dependency budget. The selected language affects the interface only;
 * it never changes the counting rules.
 */

import { en } from './en';
import { ja } from './ja';
import { es } from './es';
import { fr } from './fr';
import { zhCN, type MessageKey, type Messages } from './zh-CN';

export type LocaleId = 'zh-CN' | 'en' | 'ja' | 'es' | 'fr';

export const LOCALES: readonly LocaleId[] = ['zh-CN', 'en', 'ja', 'es', 'fr'];

/** Native names, so the switcher is readable whatever the current language is. */
export const LOCALE_LABELS: Record<LocaleId, string> = {
  'zh-CN': '中文',
  en: 'English',
  ja: '日本語',
  es: 'Español',
  fr: 'Français',
};

const DICTIONARIES: Record<LocaleId, Messages> = {
  'zh-CN': zhCN,
  en,
  ja,
  es,
  fr,
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
  return locale === 'en' ? 'en-US' : locale;
}

export type { MessageKey, Messages };
