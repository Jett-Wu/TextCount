/**
 * Application shell.
 *
 * The layout states the product's priorities: the numbers sit directly above the workspace and
 * stay aligned with it, the text area is by far the largest element, and the tools are a narrow
 * secondary column. Nothing is hidden behind a hero and the tools never replace the editor.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { LOCALE_LABELS, LOCALES } from '../locales';
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
import { Icon, NumberValue, useSelectionIndicator } from './common';
import { Editor } from './Editor';
import { InsightsPanel, type InsightSession } from './InsightsPanel';
import { InspectorPanel } from './InspectorPanel';
import { SearchPanel, type SearchSession } from './SearchPanel';
import { StatsPanel } from './StatsPanel';

const TOOLS: readonly ToolId[] = ['stats', 'search', 'symbols', 'insights'];
const THEMES: readonly ThemePreference[] = ['system', 'light', 'dark'];

function TopBar() {
  const t = useTranslate();
  const locale = useLocale();
  const theme = useStore(appStore, (state) => state.theme);
  const [languageOpen, setLanguageOpen] = useState(false);
  const picker = useRef<HTMLDivElement>(null);
  const languageButton = useRef<HTMLButtonElement>(null);
  const nextTheme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]!;

  const closeLanguage = (restoreFocus = true) => {
    setLanguageOpen(false);
    if (restoreFocus) languageButton.current?.focus({ preventScroll: true });
  };

  useLayoutEffect(() => {
    if (languageOpen) {
      picker.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    }
  }, [languageOpen]);

  useEffect(() => {
    if (!languageOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (!picker.current?.contains(event.target as Node)) closeLanguage(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [languageOpen]);

  return (
    <header class="topbar">
      <div class="brand">
        <span class="brand__mark" aria-hidden="true">
          T
        </span>
        <span class="brand__name">{t('app.name')}</span>
      </div>

      <div class="topbar__controls">
        <div class="language-picker" ref={picker}>
          <button ref={languageButton} type="button" class="header-button language-trigger"
            data-control="locale" aria-label={t('topbar.language')}
            aria-haspopup="menu" aria-controls="language-menu" aria-expanded={languageOpen}
            title={`${t('topbar.language')}: ${LOCALE_LABELS[locale]}`}
            onClick={() => setLanguageOpen(!languageOpen)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                setLanguageOpen(true);
              } else if (event.key === 'Escape') closeLanguage();
            }}>
            <Icon name="language" />
          </button>
          {languageOpen ? (
            <div class="language-menu" id="language-menu" role="menu" aria-label={t('topbar.language')}
              onKeyDown={(event) => {
                const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
                const index = items.indexOf(document.activeElement as HTMLButtonElement);
                if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                  event.preventDefault();
                  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
                    : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
                  items[next]?.focus();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  event.stopPropagation();
                  closeLanguage();
                } else if (event.key === 'Tab') {
                  event.preventDefault();
                  closeLanguage();
                  if (!event.shiftKey) document.querySelector<HTMLButtonElement>('[data-control="theme"]')?.focus();
                }
              }}>
              {LOCALES.map((id) => (
                <button key={id} type="button" role="menuitemradio" aria-checked={locale === id}
                  tabIndex={-1} class="language-menu__item" lang={id} data-locale={id}
                  onClick={() => { setLocale(id); closeLanguage(); }}>
                  <span>{LOCALE_LABELS[id]}</span>
                  {locale === id ? <Icon name="check" /> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <button type="button" class="header-button theme-button" data-control="theme"
          data-theme-preference={theme} aria-label={`${t('topbar.theme')}: ${t(`topbar.theme.${theme}`)}`}
          title={`${t(`topbar.theme.${theme}`)} → ${t(`topbar.theme.${nextTheme}`)}`}
          onClick={() => setTheme(nextTheme)}>
          <span class="theme-button__glyph" key={theme}>
            <Icon name={theme === 'system' ? 'system' : theme === 'dark' ? 'moon' : 'sun'} />
          </span>
        </button>
        <a class="header-link" href="https://github.com/Jett-Wu/TextCount" target="_blank"
          rel="noopener noreferrer" aria-label="GitHub" title="GitHub · TextCount">
          <Icon name="github" />
        </a>
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
        <button class="stats__label stats__label--action" title={t('stats.rules.open')}
          onClick={() => { setActiveTool('stats'); appStore.set({ ruleMenuOpen: true }); }}>
          {t(`headline.primary.${metric}`)}
        </button>
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
        <span class="stats__label">{t('headline.paragraphs')}</span>
        <NumberValue value={stats.paragraphs} class="stats__value" />
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
  const indicator = useSelectionIndicator(active);
  const panel = useRef<HTMLDivElement>(null);
  const searchSession = useRef<SearchSession>({ terms: [], draft: '', caseSensitive: true, activeTerm: 0, activeMatch: 0 });
  const insightSession = useRef<InsightSession>({ view: 'cloud', order: 'document', unit: 'word', filterStopWords: true });
  useLayoutEffect(() => {
    if (panel.current) panel.current.scrollTop = 0;
  }, [active]);

  const moveFocus = (delta: number): void => {
    const index = TOOLS.indexOf(active);
    const next = TOOLS[(index + delta + TOOLS.length) % TOOLS.length];
    if (next === undefined) return;
    setActiveTool(next);
    document.getElementById(`textcount-tab-${next}`)?.focus();
  };

  return (
    <aside class="tools">
      <div class="tools__head">
        <div ref={indicator} class="switcher motion-track" role="tablist" aria-label={t('tools.label')}>
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
                  } else if (event.key === 'Home' || event.key === 'End') {
                    event.preventDefault();
                    const next = event.key === 'Home' ? TOOLS[0]! : TOOLS.at(-1)!;
                    setActiveTool(next);
                    document.getElementById(`textcount-tab-${next}`)?.focus();
                  }
                }}
              >
                {t(`tool.${tool}`)}
              </button>
            );
          })}
        </div>
      </div>

      <div
        ref={panel}
        class="tools__panel"
        role="tabpanel"
        id={`textcount-panel-${active}`}
        aria-labelledby={`textcount-tab-${active}`}
        data-testid={`panel-${active}`}
      >
        {active === 'stats' ? <StatsPanel /> : null}
        {active === 'search' ? <SearchPanel session={searchSession} /> : null}
        {active === 'symbols' ? <InspectorPanel /> : null}
        {active === 'insights' ? <InsightsPanel session={insightSession} /> : null}
      </div>
    </aside>
  );
}

export function App() {
  const t = useTranslate();
  const locale = useLocale();

  useEffect(() => {
    document.documentElement.setAttribute('lang', locale);
  }, [locale]);

  useEffect(() => {
    document.title = `${t('app.name')} — ${t('app.tagline')}`;
  }, [t]);

  /*
   * Attached once rather than only while the menu is open. Gating it on `ruleMenuOpen` left a
   * window — from the click that opens the menu until the effect runs — during which the menu was
   * on screen and Escape did nothing; WebKit reproduced it, and a listener that exists only after
   * a render is a needless dependency on render timing.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      if (!appStore.get().ruleMenuOpen) return;
      appStore.set({ ruleMenuOpen: false });
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

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
