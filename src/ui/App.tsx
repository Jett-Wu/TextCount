/**
 * Application shell.
 *
 * The layout is the product promise in structural form: a compact header, the three headline
 * numbers always visible, the text area as the largest element, and a narrow tool panel beside
 * it. Nothing is hidden below a marketing hero, and the tools never replace the editor.
 */
import { useEffect } from 'preact/hooks';
import { appStore } from '../app/appState';
import { useStore } from '../app/store';
import { useLocale, useTranslate } from '../app/useTranslate';
import { AboutDialog } from './AboutDialog';
import { Editor } from './editor/Editor';
import { Headline } from './stats/Headline';
import { TopBar } from './TopBar';
import { ToolPanel } from './ToolPanel';

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
