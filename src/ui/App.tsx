/**
 * Application shell.
 *
 * The layout states the product's priorities: the numbers sit directly above the workspace and
 * stay aligned with it, the text area is by far the largest element, and the tools are a narrow
 * secondary column. Nothing is hidden behind a hero and the tools never replace the editor.
 */

import { useEffect } from 'preact/hooks';
import { LOCALE_LABELS, LOCALE_SHORT_LABELS, LOCALES, type LocaleId } from '../locales';
import {
  appStore,
  setActiveTool,
  setLocale,
  setTheme,
  useLocale,
  useStore,
  useTranslate,
  type ThemePreference,
  type ToolId,
} from '../app/state';
import { NumberValue, Segmented } from './common';
import { Editor } from './Editor';
import { InspectorPanel } from './InspectorPanel';
import { SearchPanel } from './SearchPanel';
import { StatsPanel } from './StatsPanel';

const TOOLS: readonly ToolId[] = ['stats', 'search', 'symbols'];

function TopBar() {
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
      </div>

      <div class="topbar__controls">
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
            { value: 'system', label: t('topbar.theme.systemShort'), title: t('topbar.theme.system') },
            { value: 'light', label: t('topbar.theme.lightShort'), title: t('topbar.theme.light') },
            { value: 'dark', label: t('topbar.theme.darkShort'), title: t('topbar.theme.dark') },
          ]}
        />
      </div>
    </header>
  );
}

/**
 * The three headline numbers.
 *
 * Always rendered — never swapped for a spinner — so the layout cannot jump while a long text
 * is being counted. Cells stretch to a common height and the values are bottom-aligned, so the
 * three numbers share one baseline even when a label wraps; anything placed after a value would
 * push that single number out of line.
 */
function Stats() {
  const t = useTranslate();
  const stats = useStore(appStore, (state) => state.stats);
  const metric = useStore(appStore, (state) => state.countSettings.primaryMetric);

  return (
    <section class="stats" aria-label={t('stats.summary')}>
      <div class="stats__item stats__item--lead">
        <span class="stats__label">{t(`headline.primary.${metric}`)}</span>
        <NumberValue value={stats.primary} class="stats__value" />
      </div>
      <div class="stats__item">
        <span class="stats__label">
          {t('headline.graphemes')}
          <span class="stats__qualifier">{t('headline.graphemesNote')}</span>
        </span>
        <NumberValue value={stats.graphemes} class="stats__value" />
      </div>
      <div class="stats__item">
        <span class="stats__label">{t('headline.primary.charsNoSpace')}</span>
        <NumberValue value={stats.graphemesNoWhitespace} class="stats__value" />
      </div>
    </section>
  );
}

/**
 * Statistics, search and punctuation share one document and one panel slot rather than living
 * on separate pages. Switching views never touches the textarea, so nothing is lost.
 */
function Tools() {
  const t = useTranslate();
  const active = useStore(appStore, (state) => state.activeTool);

  const moveFocus = (delta: number): void => {
    const index = TOOLS.indexOf(active);
    const next = TOOLS[(index + delta + TOOLS.length) % TOOLS.length];
    if (next === undefined) return;
    setActiveTool(next);
    document.getElementById(`textcount-tab-${next}`)?.focus();
  };

  return (
    <aside class="tools">
      <div class="switcher" role="tablist" aria-label={t('tools.label')}>
        {TOOLS.map((tool) => {
          const selected = tool === active;
          return (
            <button
              key={tool}
              type="button"
              role="tab"
              id={`textcount-tab-${tool}`}
              class={selected ? 'switcher__item switcher__item--on' : 'switcher__item'}
              aria-selected={selected}
              aria-controls={`textcount-panel-${tool}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveTool(tool)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight') {
                  event.preventDefault();
                  moveFocus(1);
                } else if (event.key === 'ArrowLeft') {
                  event.preventDefault();
                  moveFocus(-1);
                }
              }}
            >
              {t(`tool.${tool}`)}
            </button>
          );
        })}
      </div>

      <div
        class="tools__panel"
        role="tabpanel"
        id={`textcount-panel-${active}`}
        aria-labelledby={`textcount-tab-${active}`}
        data-testid={`panel-${active}`}
      >
        {active === 'stats' ? <StatsPanel /> : null}
        {active === 'search' ? <SearchPanel /> : null}
        {active === 'symbols' ? <InspectorPanel /> : null}
      </div>
    </aside>
  );
}

export function App() {
  const t = useTranslate();
  const locale = useLocale();
  const ruleMenuOpen = useStore(appStore, (state) => state.ruleMenuOpen);

  useEffect(() => {
    document.documentElement.setAttribute('lang', locale);
  }, [locale]);

  useEffect(() => {
    document.title = `${t('app.name')} — ${t('app.tagline')}`;
  }, [t]);

  useEffect(() => {
    if (!ruleMenuOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') appStore.set({ ruleMenuOpen: false });
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [ruleMenuOpen]);

  return (
    <div class="app">
      <TopBar />
      <Stats />
      <main class="workspace">
        <Editor />
        <Tools />
      </main>
    </div>
  );
}
