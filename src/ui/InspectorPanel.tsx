/**
 * Full-width / half-width and punctuation inspection.
 *
 * Read-only by design: it reports which forms occur, how often and where — it never converts,
 * replaces or normalises anything. The wording is "more than one form" rather than "wrong",
 * because mixing is often correct in mixed Chinese/English text.
 */

import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { findTermMatches, revealRange } from '../app/editor';
import { appStore, runSymbols, useStore, useTranslate } from '../app/state';
import type { MatchResult } from '../core/search';
import type { SymbolReport } from '../core/symbols';
import type { MessageKey } from '../locales';
import { Icon } from './common';

const SYMBOL_DEBOUNCE_MS = 150;

const GROUP_LABELS: Record<string, MessageKey> = {
  comma: 'symbols.group.comma',
  period: 'symbols.group.period',
  colon: 'symbols.group.colon',
  semicolon: 'symbols.group.semicolon',
  exclamation: 'symbols.group.exclamation',
  question: 'symbols.group.question',
  paren: 'symbols.group.paren',
  bracket: 'symbols.group.bracket',
  brace: 'symbols.group.brace',
  angle: 'symbols.group.angle',
  'quote-double': 'symbols.group.quote-double',
  'quote-single': 'symbols.group.quote-single',
  dash: 'symbols.group.dash',
  ellipsis: 'symbols.group.ellipsis',
  tilde: 'symbols.group.tilde',
  slash: 'symbols.group.slash',
  backslash: 'symbols.group.backslash',
  pipe: 'symbols.group.pipe',
  at: 'symbols.group.at',
  hash: 'symbols.group.hash',
  dollar: 'symbols.group.dollar',
  percent: 'symbols.group.percent',
  ampersand: 'symbols.group.ampersand',
  asterisk: 'symbols.group.asterisk',
  plus: 'symbols.group.plus',
  equals: 'symbols.group.equals',
  underscore: 'symbols.group.underscore',
  caret: 'symbols.group.caret',
  backtick: 'symbols.group.backtick',
  'middle-dot': 'symbols.group.middle-dot',
  'corner-bracket': 'symbols.group.corner-bracket',
  'book-title': 'symbols.group.book-title',
  lenticular: 'symbols.group.lenticular',
};

type InspectorStatus = 'idle' | 'running' | 'done';

/**
 * A symbol the reader is walking through. The offsets belong to one revision of the text, so the
 * whole state is dropped when the document changes rather than being re-validated.
 *
 * `key` identifies the chip that was clicked, not just the character: the same symbol can appear in
 * both the related-forms group and the category list, and keying on the character alone highlighted
 * both and rendered two navigators for one symbol.
 */
interface ActiveSymbol {
  key: string;
  char: string;
  index: number;
  matches: MatchResult;
}

export function InspectorPanel() {
  const t = useTranslate();
  const revision = useStore(appStore, (state) => state.revision);
  const textLength = useStore(appStore, (state) => state.textLength);
  const [report, setReport] = useState<SymbolReport | null>(null);
  const [status, setStatus] = useState<InspectorStatus>('idle');
  const [active, setActive] = useState<ActiveSymbol | null>(null);

  useEffect(() => {
    setActive(null);
    if (textLength === 0) {
      setReport(null);
      setStatus('idle');
      return;
    }
    let cancelled = false;
    setStatus('running');
    const handle = setTimeout(() => {
      // `null` means the document changed while the scan was running.
      void runSymbols().then((found) => {
        if (cancelled || found === null) return;
        setReport(found);
        setStatus('done');
      });
    }, SYMBOL_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [revision, textLength]);

  if (textLength === 0) {
    return (
      <div class="panel-body">
        <p class="panel-empty">{t('symbols.emptyText')}</p>
      </div>
    );
  }

  const reveal = (matches: MatchResult, index: number): void => {
    const start = matches.positions[index];
    if (start === undefined) return;
    revealRange(start, start + (matches.lengths[index] ?? 1));
  };

  const locate = (key: string, char: string): void => {
    const matches = findTermMatches(char);
    if (matches.positions.length === 0) return;
    reveal(matches, 0);
    setActive({ key, char, index: 0, matches });
  };

  const step = (delta: number): void => {
    if (active === null) return;
    const total = active.matches.positions.length;
    if (total === 0) return;
    const index = (active.index + delta + total) % total;
    reveal(active.matches, index);
    setActive({ ...active, index });
  };

  // Sibling buttons share one visual wrapper; nesting them in the locating button is invalid HTML.
  const navigation = (): JSX.Element | null => {
    if (active === null) return null;
    const total = active.matches.positions.length;
    if (total <= 1) return null;
    return (
      <span class="chip-nav">
        <button type="button" class="chip-nav__button" onClick={() => step(-1)} aria-label={t('search.prev')}>
          <Icon name="chevron" />
        </button>
        <span
          class="chip-nav__position"
          /* Machine-readable position so tests do not depend on a translated sentence. */
          data-index={active.index + 1}
          data-total={total}
          role="status"
          aria-atomic="true"
          title={
            active.matches.truncated
              ? t('search.truncated', { kept: total, total: active.matches.count })
              : ''
          }
        >
          <span aria-hidden="true">{active.index + 1} / {total}</span>
          <span class="chip-nav__announcement">{t('search.position', { index: active.index + 1, total })}</span>
        </span>
        <button type="button" class="chip-nav__button" onClick={() => step(1)} aria-label={t('search.next')}>
          <Icon name="chevron" />
        </button>
      </span>
    );
  };

  if (report === null) {
    return (
      <div class="panel-body">
        <p class="hint hint--busy">{t('symbols.loading')}</p>
      </div>
    );
  }

  return (
    <div class="panel-body">
      {status === 'running' ? <p class="hint hint--busy">{t('symbols.loading')}</p> : null}

      <div class="sym-total">
        <span class="sym-total__label">{t('symbols.total')}</span>
        <span class="value sym-total__value">{report.total}</span>
      </div>

      {report.empty ? <p class="panel-empty">{t('symbols.empty')}</p> : null}

      {report.groups.length > 0 ? (
        <>
          <h3 class="panel-heading">{t('symbols.related')}</h3>
          <ul class="group-list">
            {report.groups.map((group) => {
              const label = GROUP_LABELS[group.id];
              return (
                <li
                  class={group.mixed ? 'group group--mixed' : 'group'}
                  key={group.id}
                  data-testid={`symbol-group-${group.id}`}
                >
                  <div class="group__head">
                    <span class="group__label">{label === undefined ? group.id : t(label)}</span>
                    <span class={group.mixed ? 'badge badge--warn' : 'badge'}>
                      {group.mixed ? t('symbols.mixedBadge') : t('symbols.singleBadge')}
                    </span>
                  </div>
                  <div class="group__members">
                    {group.members
                      .filter((member) => member.count > 0)
                      .map((member) => {
                        const chipKey = `group:${group.id}:${member.codePoint}`;
                        const isActive = active?.key === chipKey;
                        return (
                          <span key={member.codePoint} class={isActive ? 'symbol-choice symbol-choice--active' : 'symbol-choice'}>
                            <button
                              type="button"
                              class={isActive ? 'chip chip--active' : 'chip'}
                              aria-pressed={isActive}
                              title={`${member.codePoint} · ${t('symbols.locate')}`}
                              onClick={() => locate(chipKey, member.char)}
                            >
                              <span class="chip__char">{member.char}</span>
                              {/* 。/．/. are nearly indistinguishable at chip size, so the code
                                  point is shown inline exactly where the ambiguity exists. */}
                              {group.mixed ? <span class="chip__code">{member.codePoint}</span> : null}
                              <span class="chip__count">{member.count}</span>
                            </button>
                            {isActive ? navigation() : null}
                          </span>
                        );
                      })}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      <h3 class="panel-heading">{t('symbols.categories')}</h3>
      {report.categories
        .filter((category) => category.count > 0)
        .map((category) => (
          <section class="sym-cat" key={category.id}>
            <div class="sym-cat__head">
              <span class="sym-cat__label">{t(`symbols.category.${category.id}`)}</span>
              <span class="sym-cat__meta">
                {t('symbols.distinct', { n: category.distinct })} · {category.count}
              </span>
            </div>
            <div class="sym-cat__entries">
              {category.entries.map((entry) => {
                const chipKey = `cat:${category.id}:${entry.codePoint}`;
                const isActive = active?.key === chipKey;
                return (
                  <span key={entry.codePoint} class={isActive ? 'symbol-choice symbol-choice--active' : 'symbol-choice'}>
                    <button
                      type="button"
                      class={isActive ? 'sym sym--active' : 'sym'}
                      aria-pressed={isActive}
                      title={`${entry.codePoint} · ${t('symbols.locate')}`}
                      onClick={() => locate(chipKey, entry.char)}
                    >
                      <span class="sym__char">{entry.char}</span>
                      <span class="sym__code">{entry.codePoint}</span>
                      <span class="sym__count">{entry.count}</span>
                    </button>
                    {isActive ? navigation() : null}
                  </span>
                );
              })}
            </div>
          </section>
        ))}

      <details class="inline-help">
        <summary>{t('help.title')}</summary>
        <p class="hint">{t('symbols.note')}</p>
      </details>
    </div>
  );
}
