/**
 * The document editor — the most important component on the page.
 *
 * The textarea is **uncontrolled**: Preact renders it once and never writes to `value` again.
 * That single decision keeps IME composition, caret, selection and undo intact, and stops a
 * multi-megabyte string from flowing through the component tree on every keystroke. Counts are
 * driven by `setText`, which only records the text and schedules a scan.
 *
 * The header, the input and the note below it form one bordered card, so the input does not read
 * as a bare rectangle and the actions belong visibly to the text they act on. Focus is shown on
 * the card (`:focus-within`) rather than with a glow on the field itself.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { copyAllText, registerEditor } from '../app/editor';
import { INLINE_ANALYSIS_LIMIT, appStore, setText, useStore, useTranslate } from '../app/state';

/** Above this size, clearing needs a confirming second click. */
const CLEAR_CONFIRM_THRESHOLD = 200_000;
const CLEAR_CONFIRM_WINDOW_MS = 4000;

export function Editor() {
  const t = useTranslate();
  const ref = useRef<HTMLTextAreaElement>(null);
  const textLength = useStore(appStore, (state) => state.textLength);
  const computing = useStore(appStore, (state) => state.computing);
  const longText = useStore(appStore, (state) => state.textLength > INLINE_ANALYSIS_LIMIT);
  const degraded = useStore(appStore, (state) => state.engineDegraded);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [clearArmed, setClearArmed] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    registerEditor(ref.current);
    return () => {
      registerEditor(null);
      if (copyTimer.current !== null) clearTimeout(copyTimer.current);
      if (clearTimer.current !== null) clearTimeout(clearTimer.current);
    };
  }, []);

  const handleCopy = (): void => {
    void copyAllText().then((ok) => {
      setCopyState(ok ? 'copied' : 'failed');
      if (copyTimer.current !== null) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopyState('idle'), 1600);
    });
  };

  const disarmClear = (): void => {
    if (clearTimer.current !== null) clearTimeout(clearTimer.current);
    clearTimer.current = null;
    setClearArmed(false);
  };

  const handleClear = (): void => {
    const element = ref.current;
    if (element === null) return;
    if (textLength > CLEAR_CONFIRM_THRESHOLD && !clearArmed) {
      setClearArmed(true);
      if (clearTimer.current !== null) clearTimeout(clearTimer.current);
      clearTimer.current = setTimeout(() => setClearArmed(false), CLEAR_CONFIRM_WINDOW_MS);
      return;
    }
    disarmClear();
    element.value = '';
    setText('');
    element.focus({ preventScroll: true });
  };

  const copyLabel =
    copyState === 'copied'
      ? t('editor.copied')
      : copyState === 'failed'
        ? t('editor.copyFailed')
        : t('editor.copy');
  const copyTitle =
    copyState === 'copied'
      ? t('editor.copied')
      : copyState === 'failed'
        ? t('editor.copyFailed')
        : t('editor.copyHint');

  return (
    <section class="editor" aria-label={t('editor.ariaLabel')}>
      <header class="editor__head">
        <h2 class="editor__title">{t('editor.title')}</h2>
        <div class="editor__actions">
          <button
            type="button"
            class="btn btn--quiet"
            onClick={handleCopy}
            disabled={textLength === 0}
            title={copyTitle}
          >
            {copyLabel}
          </button>
          <button
            type="button"
            class={clearArmed ? 'btn btn--quiet btn--armed' : 'btn btn--quiet'}
            onClick={handleClear}
            onBlur={disarmClear}
            disabled={textLength === 0}
            title={clearArmed ? t('editor.clearConfirmHint') : t('editor.clear')}
          >
            {clearArmed ? t('editor.clearConfirm') : t('editor.clear')}
          </button>
        </div>
      </header>

      <div class="editor__body">
        <textarea
          ref={ref}
          class="editor__input"
          id="textcount-editor"
          placeholder={t('editor.placeholder')}
          aria-label={t('editor.ariaLabel')}
          spellcheck={false}
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          onInput={(event) => setText(event.currentTarget.value)}
        />
      </div>

      <footer class="editor__foot">
        <p class="editor__note">
          <span>{t('editor.localNote')}</span>
          {/* Kept visible rather than hidden in a tooltip: the honest caveat that the host keeps
              access logs is part of the privacy claim, not a footnote to it. */}
          <span class="editor__note-detail">{t('editor.hostingNote')}</span>
        </p>
        <span class="editor__status" aria-live="polite">
          {computing ? <span class="pill pill--busy">{t('editor.computing')}</span> : null}
          {longText && !computing ? <span class="pill">{t('editor.longText')}</span> : null}
          {longText && degraded ? (
            <span class="pill pill--warn">{t('editor.degradedNotice')}</span>
          ) : null}
        </span>
      </footer>
    </section>
  );
}
