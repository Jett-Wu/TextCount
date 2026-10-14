/**
 * Application shell.
 *
 * The layout is the product promise in structural form: a compact header, the three headline
 * numbers always visible, the text area as the largest element, and a narrow tool panel beside
 * it. Nothing is hidden below a hero, and the tools never replace the editor.
 */

import { useEffect } from 'preact/hooks';
import {
  LOCALE_LABELS,
  LOCALE_SHORT_LABELS,
  LOCALES,
  type LocaleId,
} from '../locales';
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
import { Dialog, NumberValue, Segmented } from './common';
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
            { value: 'system', label: t('topbar.theme.systemShort'), title: t('topbar.theme.system') },
            { value: 'light', label: t('topbar.theme.lightShort'), title: t('topbar.theme.light') },
            { value: 'dark', label: t('topbar.theme.darkShort'), title: t('topbar.theme.dark') },
          ]}
        />
        <button type="button" class="btn btn--ghost" onClick={() => appStore.set({ aboutOpen: true })}>
          {t('topbar.about')}
        </button>
      </div>
    </header>
  );
}

/**
 * Always rendered, never swapped for a spinner, so the layout does not jump while counting.
 *
 * The "including spaces" qualifier sits inside the label rather than under the number: the
 * cells stretch to a common height and the values are bottom-aligned, so anything placed after
 * a value would push that one number out of line with the others.
 */
function Headline() {
  const t = useTranslate();
  const stats = useStore(appStore, (state) => state.stats);
  const metric = useStore(appStore, (state) => state.countSettings.primaryMetric);

  return (
    <section class="headline" role="group" aria-label={t('stats.detail')}>
      <div class="headline__cell headline__cell--lead">
        <span class="headline__label">{t(`headline.primary.${metric}`)}</span>
        <NumberValue value={stats.primary} class="headline__value" />
      </div>
      <div class="headline__cell">
        <span class="headline__label">
          {t('headline.graphemes')}
          <span class="headline__note">{t('headline.graphemesNote')}</span>
        </span>
        <NumberValue value={stats.graphemes} class="headline__value" />
      </div>
      <div class="headline__cell">
        <span class="headline__label">{t('headline.primary.charsNoSpace')}</span>
        <NumberValue value={stats.graphemesNoWhitespace} class="headline__value" />
      </div>
    </section>
  );
}

/**
 * Statistics, search and punctuation share one document and one panel slot rather than living
 * on separate pages. Switching views never touches the textarea, so nothing is lost.
 */
function ToolPanel() {
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
    <aside class="pane pane--tools">
      <div class="tabs" role="tablist" aria-label={t('stats.detail')}>
        {TOOLS.map((tool) => {
          const selected = tool === active;
          return (
            <button
              key={tool}
              type="button"
              role="tab"
              id={`textcount-tab-${tool}`}
              class={selected ? 'tab tab--on' : 'tab'}
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
        class="panel"
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

/**
 * The privacy wording promises exactly what the implementation guarantees and does not claim
 * the *visit* is anonymous, because GitHub Pages keeps standard access logs.
 */
function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslate();

  return (
    <Dialog open={open} onClose={onClose} title={t('about.title')} labelledBy="textcount-about-title">
      <section class="about__section">
        <h3 class="section-title">{t('about.privacy.title')}</h3>
        <p>{t('about.privacy.body')}</p>
        <p class="muted">{t('about.privacy.hosting')}</p>
      </section>
      <section class="about__section">
        <h3 class="section-title">{t('about.rules.title')}</h3>
        <p>{t('about.rules.body')}</p>
        <ul class="about__list">
          <li>{t('about.rules.han')}</li>
          <li>{t('about.rules.latin')}</li>
          <li>{t('about.rules.digit')}</li>
          <li>{t('about.rules.other')}</li>
          <li>{t('about.rules.char')}</li>
        </ul>
      </section>
      <section class="about__section">
        <h3 class="section-title">{t('about.shortcuts.title')}</h3>
        <p>{t('about.shortcuts.body')}</p>
      </section>
    </Dialog>
  );
}

export function App() {
  const t = useTranslate();
  const locale = useLocale();
  const aboutOpen = useStore(appStore, (state) => state.aboutOpen);
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
      <Headline />
      <main class="workspace">
        <Editor />
        <ToolPanel />
      </main>
      <footer class="footer">
        <span>{t('footer.local')}</span>
        <span class="footer__sep" aria-hidden="true">
          ·
        </span>
        <span class="muted">{t('footer.hosting')}</span>
      </footer>
      <AboutDialog open={aboutOpen} onClose={() => appStore.set({ aboutOpen: false })} />
    </div>
  );
}
