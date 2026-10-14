/**
 * Hooks for reading the interface language and theme from anywhere in the tree.
 *
 * Passing the translator down through props would make every component's signature depend on
 * the dictionary; a hook keeps the components focused on what they render.
 */
import { useMemo } from 'preact/hooks';
import { createTranslator, type LocaleId, type Translate } from '../locales';
import { appStore } from './appState';
import { useStore } from './store';

export function useLocale(): LocaleId {
  return useStore(appStore, (state) => state.locale);
}

export function useTranslate(): Translate {
  const locale = useLocale();
  return useMemo(() => createTranslator(locale), [locale]);
}
