import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { appStore, setText, useTranslate } from '../app/state';
import { importDocument } from '../import/document';
import { DocumentError, documentKind, type DocumentKind, type ImportFailure, type ImportProgress } from '../import/format';
import { Icon } from './common';

type ImportState =
  | { phase: 'idle' }
  | { phase: 'loading'; name: string; progress?: ImportProgress }
  | { phase: 'ready'; name: string; text: string; kind: DocumentKind }
  | { phase: 'done'; name: string; kind: DocumentKind }
  | { phase: 'error'; name: string; error: ImportFailure };

export function DocumentImport({ editor }: { editor: { current: HTMLTextAreaElement | null } }) {
  const t = useTranslate();
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const confirmation = useRef<HTMLButtonElement>(null);
  const control = useRef<HTMLDivElement>(null);
  const active = useRef<AbortController | null>(null);
  const [state, setState] = useState<ImportState>({ phase: 'idle' });

  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => { if (state.phase === 'ready') confirmation.current?.focus(); }, [state.phase]);

  // A visible notice must already handle Escape; a passive effect leaves a post-paint gap.
  useLayoutEffect(() => {
    if (state.phase !== 'done' && state.phase !== 'error') return;
    // Informational notices should yield to reading; outside clicks never cancel pending imports.
    const outside = (event: PointerEvent) => {
      if (!control.current?.contains(event.target as Node)) setState({ phase: 'idle' });
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      if (control.current?.contains(document.activeElement)) trigger.current?.focus({ preventScroll: true });
      setState({ phase: 'idle' });
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape, true);
    };
  }, [state.phase]);

  const dismiss = () => {
    active.current?.abort();
    active.current = null;
    setState({ phase: 'idle' });
    trigger.current?.focus({ preventScroll: true });
  };

  const apply = (result: { text: string; name: string; kind: DocumentKind }) => {
    const element = editor.current;
    if (!element) return;
    // Focus/scroll on the old value avoids forcing the new document's layout before scheduling
    // its count. Native value assignment can still lay out text when replacing an edited document.
    element.focus({ preventScroll: true });
    element.scrollTop = 0;
    element.scrollLeft = 0;
    // This explicit user action is the only import write; normal renders never rewrite the textarea.
    element.value = result.text;
    element.setSelectionRange(0, 0);
    setText(result.text);
    setState({ phase: 'done', name: result.name, kind: result.kind });
  };

  const start = async (file: File) => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const revision = appStore.get().revision;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 120_000);
    setState({ phase: 'loading', name: file.name });
    try {
      documentKind(file.name, file.size);
      const result = await importDocument(file, controller.signal, (progress) => {
        if (active.current === controller) setState({ phase: 'loading', name: file.name, progress });
      });
      if (active.current !== controller) return;
      const ready = { ...result, name: file.name };
      // A file finishing late must not overwrite text typed or pasted while extraction was running.
      if (editor.current?.value || appStore.get().revision !== revision) setState({ phase: 'ready', ...ready });
      else apply(ready);
    } catch (error) {
      if (active.current !== controller) return;
      const code = timedOut ? 'timeout' : error instanceof DocumentError ? error.code : 'invalid';
      setState(code === 'cancelled' ? { phase: 'idle' } : { phase: 'error', name: file.name, error: code });
    } finally {
      clearTimeout(timeout);
      if (active.current === controller) active.current = null;
    }
  };

  return <div ref={control} class="import-control" onKeyDown={(event) => {
    if (event.key === 'Escape' && state.phase !== 'idle') { event.stopPropagation(); dismiss(); }
  }}>
    <input ref={input} hidden type="file" accept=".pdf,.docx,.doc" data-testid="document-file"
      aria-label={t('import.open')} onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (file) void start(file);
      }} />
    <button ref={trigger} class="btn btn--quiet btn--icon" type="button" data-control="import"
      aria-label={t('import.open')} title={t('import.hint')} aria-expanded={state.phase !== 'idle'}
      aria-controls="document-import-notice" onClick={() => input.current?.click()}>
      <Icon name="import" />
    </button>
    {state.phase !== 'idle' && <div class="import-notice" id="document-import-notice"
      role={state.phase === 'ready' ? 'dialog' : 'status'} aria-label={t('import.open')}>
      <div class="import-notice__head">
        <span class="import-notice__name" title={state.name}>{state.name}</span>
        <button type="button" class="btn btn--quiet btn--icon" aria-label={t('import.close')} onClick={dismiss}>
          <Icon name="close" />
        </button>
      </div>
      {state.phase === 'loading' ? <>
        <p class="import-notice__message"><span class="import-spinner" aria-hidden="true" />
          {state.progress ? t('import.progress', { page: state.progress.page, total: state.progress.total }) : t('import.loading')}
        </p>
        <button type="button" class="btn btn--quiet" onClick={dismiss}>{t('import.cancel')}</button>
      </> : state.phase === 'ready' ? <>
        <p class="import-notice__message">{t('import.replaceHint')}</p>
        <div class="import-notice__actions">
          <button ref={confirmation} type="button" class="btn btn--quiet" onClick={dismiss}>{t('import.cancel')}</button>
          <button type="button" class="btn btn--primary" onClick={() => apply(state)}>{t('import.replace')}</button>
        </div>
      </> : state.phase === 'error' ? <p class="import-notice__message">{t(`import.error.${state.error}`)}</p>
        : <p class="import-notice__message">{t(`import.note.${state.kind}`)}</p>}
    </div>}
  </div>;
}
