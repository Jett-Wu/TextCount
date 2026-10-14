/**
 * Persisted user preferences.
 *
 * Only non-sensitive UI preferences are stored: theme, interface language and the counting
 * rule selection. The user's text is never written to `localStorage`, to the URL or to any
 * other durable place — reloading the page is expected to lose the document.
 *
 * Every access is guarded because `localStorage` throws in private mode and when storage is
 * disabled by policy.
 */
import { DEFAULT_COUNT_SETTINGS, normalizeCountSettings, type CountSettings } from '../core/rules';
import { LOCALES, type LocaleId } from '../locales';

export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_KEY = 'textcount.theme';
const LOCALE_KEY = 'textcount.locale';
const RULES_KEY = 'textcount.rules';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: preferences simply do not persist for this session */
  }
}

export function loadTheme(): ThemePreference {
  const stored = read(THEME_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

export function saveTheme(theme: ThemePreference): void {
  write(THEME_KEY, theme);
}

export function loadLocale(): LocaleId {
  const stored = read(LOCALE_KEY);
  if (stored !== null && (LOCALES as readonly string[]).includes(stored)) return stored as LocaleId;
  return detectLocale();
}

export function saveLocale(locale: LocaleId): void {
  write(LOCALE_KEY, locale);
}

/** Picks the initial interface language from the browser, defaulting to English. */
export function detectLocale(): LocaleId {
  try {
    const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const language of languages) {
      if (typeof language !== 'string') continue;
      if (language.toLowerCase().startsWith('zh')) return 'zh-CN';
      if (language.toLowerCase().startsWith('en')) return 'en';
    }
  } catch {
    /* no navigator (tests): fall through */
  }
  return 'en';
}

export function loadCountSettings(): CountSettings {
  const raw = read(RULES_KEY);
  if (raw === null) return { ...DEFAULT_COUNT_SETTINGS };
  try {
    return normalizeCountSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_COUNT_SETTINGS };
  }
}

export function saveCountSettings(settings: CountSettings): void {
  try {
    write(RULES_KEY, JSON.stringify(settings));
  } catch {
    /* unreachable: settings are always JSON-serialisable, guarded for symmetry */
  }
}
