/**
 * Multi-target literal search.
 *
 * The count is always exact; only the rendered positions are bounded, so a term occurring
 * 200 000 times still reports 200 000 while the panel stays small. Locating a match selects it
 * in the textarea — the document itself is never modified.
 */

import { useEffect, useMemo, useState } from 'preact/hooks';
import { revealRange } from '../app/editor';
import { appStore, getText, runFind, useStore, useTranslate } from '../app/state';
import { contextAround, type MatchResult } from '../core/search';

const SEARCH_DEBOUNCE_MS = 120;
const CONTEXT_RADIUS = 90;

type SearchStatus = 'idle' | 'running' | 'done';

export function SearchPanel() {
  const t = useTranslate();
  const revision = useStore(appStore, (state) => state.revision);
  const [terms, setTerms] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(true);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [activeTerm, setActiveTerm] = useState(0);
  const [activeMatch, setActiveMatch] = useState(0);

  useEffect(() => {
    if (terms.length === 0) {
      setResults([]);
      setStatus('idle');
      return;
    }
    let cancelled = false;
    setStatus('running');
    const handle = setTimeout(() => {
      // `null` means the document changed mid-flight: the numbers would describe text the user
      // has already edited, so they are dropped rather than displayed.
      void runFind(terms, caseSensitive).then((found) => {
        if (cancelled || found === null) return;
        setResults(found);
        setStatus('done');
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [terms, caseSensitive, revision]);

  const termCount = results.length;
  const safeTerm = termCount === 0 ? 0 : Math.min(activeTerm, termCount - 1);
  const activeResult = results[safeTerm];
  const navigable = activeResult?.positions.length ?? 0;
  const safeMatch = navigable === 0 ? 0 : Math.min(activeMatch, navigable - 1);

  const context = useMemo(() => {
    if (activeResult === undefined || navigable === 0) return null;
    const start = activeResult.positions[safeMatch];
    if (start === undefined) return null;
    const length = activeResult.lengths[safeMatch] ?? activeResult.term.length;
    return contextAround(getText(), start, length, CONTEXT_RADIUS);
  }, [activeResult, safeMatch, navigable, revision]);

  const addTerm = (): void => {
    const term = draft;
    if (term.length === 0) return;
    setTerms((previous) => (previous.includes(term) ? previous : [...previous, term]));
    setDraft('');
    setActiveTerm(terms.length);
    setActiveMatch(0);
  };

  const removeTerm = (index: number): void => {
    setTerms((previous) => previous.filter((_, position) => position !== index));
    setActiveTerm((previous) => (previous >= index ? Math.max(0, previous - 1) : previous));
    setActiveMatch(0);
  };

  /**
   * A term with zero matches must still become active — the user added it precisely to confirm
   * it is absent, so the panel has to be able to say so. Only revealing is conditional.
   */
  const selectTerm = (termIndex: number): void => {
    setActiveTerm(termIndex);
    setActiveMatch(0);
    const result = results[termIndex];
    const start = result?.positions[0];
    if (result === undefined || start === undefined) return;
    revealRange(start, start + (result.lengths[0] ?? result.term.length));
  };

  const step = (termIndex: number, delta: number): void => {
    const result = results[termIndex];
    if (result === undefined || result.positions.length === 0) {
      selectTerm(termIndex);
      return;
    }
    const count = result.positions.length;
    const base = termIndex === safeTerm ? safeMatch : 0;
    const next = (((base + delta) % count) + count) % count;
    setActiveTerm(termIndex);
    setActiveMatch(next);
    const start = result.positions[next];
    if (start === undefined) return;
    revealRange(start, start + (result.lengths[next] ?? result.term.length));
  };

  const matchLabel = (count: number): string =>
    count === 0
      ? t('search.noMatch')
      : count === 1
        ? t('search.matchOne', { n: count })
        : t('search.matchMany', { n: count });

  return (
    <div class="panel-body">
      <form
        class="search-form"
        onSubmit={(event) => {
          event.preventDefault();
          addTerm();
        }}
      >
        <input
          class="input"
          type="text"
          value={draft}
          placeholder={t('search.placeholder')}
          aria-label={t('search.placeholder')}
          onInput={(event) => setDraft(event.currentTarget.value)}
        />
        <button type="submit" class="btn btn--primary" disabled={draft.length === 0}>
          {t('search.add')}
        </button>
      </form>

      <label class="check">
        <input
          type="checkbox"
          checked={caseSensitive}
          onChange={(event) => setCaseSensitive(event.currentTarget.checked)}
        />
        <span>{t('search.caseSensitive')}</span>
      </label>

      {/*
        The two matching rules are one piece of information, so they read as one group. Left as
        separate panel children they inherited the panel's 24px rhythm and pushed the results down
        by an extra 24px for no gain — the results were further from the query than the two
        footnotes were from each other.
      */}
      <div class="help">
        <p class="hint">{t('search.hint')}</p>
        <p class="hint">{t('search.overlapHint')}</p>
      </div>

      {terms.length === 0 ? <p class="panel-empty">{t('search.empty')}</p> : null}
      {status === 'running' && terms.length > 0 ? (
        <p class="hint hint--busy">{t('search.running')}</p>
      ) : null}

      <ul class="term-list">
        {terms.map((term, index) => {
          const result = results[index];
          const count = result?.count ?? 0;
          const isActive = index === safeTerm && terms.length > 0;
          const positionCount = result?.positions.length ?? 0;
          return (
            <li
              key={`${term}-${index}`}
              class={isActive ? 'term term--active' : 'term'}
              data-testid="search-term"
            >
              <div class="term__head">
                <button
                  type="button"
                  class="term__button"
                  onClick={() => selectTerm(index)}
                  title={t('search.locate')}
                >
                  <span class="term__text">{term}</span>
                  <span class={count > 0 ? 'term__count term__count--hit' : 'term__count'}>
                    {matchLabel(count)}
                  </span>
                </button>
                <button
                  type="button"
                  class="btn btn--ghost"
                  onClick={() => removeTerm(index)}
                  aria-label={`${t('search.remove')}: ${term}`}
                >
                  ✕
                </button>
              </div>

              {isActive && positionCount > 0 ? (
                <div class="term__nav">
                  <button
                    type="button"
                    class="btn btn--icon"
                    onClick={() => step(index, -1)}
                    aria-label={t('search.prev')}
                  >
                    ‹
                  </button>
                  <span class="term__position">
                    {t('search.position', { index: safeMatch + 1, total: positionCount })}
                  </span>
                  <button
                    type="button"
                    class="btn btn--icon"
                    onClick={() => step(index, 1)}
                    aria-label={t('search.next')}
                  >
                    ›
                  </button>
                </div>
              ) : null}

              {result?.truncated === true ? (
                <p class="hint">
                  {t('search.truncated', { kept: result.positions.length, total: result.count })}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {activeResult !== undefined && activeResult.count === 0 && status === 'done' ? (
        <div class="context context--empty" data-testid="search-context-empty">
          <span class="context__empty">{t('search.noMatchDetail')}</span>
        </div>
      ) : null}

      {context !== null ? (
        <div class="context" data-testid="search-context">
          <div class="context__text">
            {context.truncatedBefore ? <span class="context__gap">…</span> : null}
            <span>{context.before}</span>
            <mark class="context__hit">{context.match}</mark>
            <span>{context.after}</span>
            {context.truncatedAfter ? <span class="context__gap">…</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
