/**
 * Top bar: brand, interface language, theme and the About entry point.
 *
 * None of these controls touch the document, so switching language or theme mid-document keeps
 * the text, the caret and the selection exactly where they were.
 */
import { appStore, setLocale, setTheme, type ThemePreference } from '../app/appState';
import { LOCALE_LABELS, LOCALE_SHORT_LABELS, LOCALES, type LocaleId } from '../locales';
import { useLocale, useTranslate } from '../app/useTranslate';
import { useStore } from '../app/store';
import { Segmented } from './common/Segmented';

export function TopBar() {
  const t = useTranslate();
  const locale = useLocale();
  const theme = useStore(appStore, (state) => state.theme);

  return (
    <header class="topbar">
      <div class="brand">
        <span class="brand__mark" aria-hidden="true">
          T
        </span>
        <span class="brand__name">{t('app.name')}</span>
        <span class="brand__tagline">{t('app.tagline')}</span>
      </div>

      <div class="topbar__actions">
        <Segmented<LocaleId>
          name="locale"
          ariaLabel={t('topbar.language')}
          value={locale}
          onChange={setLocale}
          options={LOCALES.map((id) => ({
            value: id,
            label: LOCALE_SHORT_LABELS[id],
            title: LOCALE_LABELS[id],
          }))}
        />
        <Segmented<ThemePreference>
          name="theme"
          ariaLabel={t('topbar.theme')}
          value={theme}
          onChange={setTheme}
          options={[
            {
              value: 'system',
              label: t('topbar.theme.systemShort'),
              title: t('topbar.theme.system'),
            },
            { value: 'light', label: t('topbar.theme.lightShort'), title: t('topbar.theme.light') },
            { value: 'dark', label: t('topbar.theme.darkShort'), title: t('topbar.theme.dark') },
          ]}
        />
        <button
          type="button"
          class="btn btn--ghost"
          onClick={() => appStore.set({ aboutOpen: true })}
        >
          {t('topbar.about')}
        </button>
      </div>
    </header>
  );
}
