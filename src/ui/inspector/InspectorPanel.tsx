/**
 * Full-width / half-width and punctuation inspection.
 *
 * This panel is **read-only by design**: it reports which forms occur, how often, and where —
 * it never converts, replaces or normalises anything. The wording is deliberately
 * "more than one form" rather than "wrong", because mixing is often correct in mixed
 * Chinese/English text and the tool has no way to know the reader's style guide.
 */
import { useEffect, useState } from 'preact/hooks';
import { appStore, runSymbols } from '../../app/appState';
import { locateFirst } from '../../app/locate';
import type { SymbolReport } from '../../core/symbols';
import { useStore } from '../../app/store';
import { useTranslate } from '../../app/useTranslate';
import type { MessageKey } from '../../locales';

const SYMBOL_DEBOUNCE_MS = 150;

const GROUP_IDS = [
  'comma',
  'period',
  'colon',
  'semicolon',
  'exclamation',
  'question',
  'paren',
  'bracket',
  'brace',
  'angle',
  'quote-double',
  'quote-single',
  'dash',
  'ellipsis',
  'tilde',
  'slash',
  'backslash',
  'pipe',
  'at',
  'hash',
  'dollar',
  'percent',
  'ampersand',
  'asterisk',
  'plus',
  'equals',
  'underscore',
  'caret',
  'backtick',
  'middle-dot',
  'corner-bracket',
  'book-title',
  'lenticular',
] as const;

type GroupId = (typeof GROUP_IDS)[number];

const GROUP_LABELS: Record<GroupId, MessageKey> = {
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

function groupLabelKey(id: string): MessageKey | null {
  return (GROUP_IDS as readonly string[]).includes(id)
    ? GROUP_LABELS[id as GroupId]
    : null;
}

type InspectorStatus = 'idle' | 'running' | 'done';

export function InspectorPanel() {
  const t = useTranslate();
  const revision = useStore(appStore, (state) => state.revision);
  const textLength = useStore(appStore, (state) => state.textLength);
  const [report, setReport] = useState<SymbolReport | null>(null);
  const [status, setStatus] = useState<InspectorStatus>('idle');

  useEffect(() => {
    if (textLength === 0) {
      setReport(null);
      setStatus('idle');
      return;
    }
    let cancelled = false;
    setStatus('running');
    const handle = setTimeout(() => {
      void runSymbols().then((found) => {
        // `null` means the document changed while the scan was running: the report would
        // describe text that no longer exists.
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
        <p class="empty-note">{t('symbols.emptyText')}</p>
      </div>
    );
  }

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

      {report.empty ? <p class="empty-note">{t('symbols.empty')}</p> : null}

      {report.groups.length > 0 ? (
        <>
          <h3 class="section-title">{t('symbols.related')}</h3>
          <ul class="group-list">
            {report.groups.map((group) => {
              const key = groupLabelKey(group.id);
              const occurring = group.members.filter((member) => member.count > 0);
              return (
                <li
                  class={group.mixed ? 'group group--mixed' : 'group'}
                  key={group.id}
                  data-testid={`symbol-group-${group.id}`}
                >
                  <div class="group__head">
                    <span class="group__label">{key === null ? group.id : t(key)}</span>
                    <span class={group.mixed ? 'badge badge--warn' : 'badge'}>
                      {group.mixed ? t('symbols.mixedBadge') : t('symbols.singleBadge')}
                    </span>
                  </div>
                  <div class="group__members">
                    {occurring.map((member) => (
                      <button
                        type="button"
                        class="chip"
                        key={member.codePoint}
                        title={`${member.codePoint} · ${t('symbols.locate')}`}
                        onClick={() => locateFirst(member.char)}
                      >
                        <span class="chip__char">{member.char}</span>
                        {/* In a mixed group the whole question is "which form is this", and
                            。 / ． / . are nearly indistinguishable at chip size — so the code
                            point is shown inline exactly where the ambiguity exists. */}
                        {group.mixed ? <span class="chip__code">{member.codePoint}</span> : null}
                        <span class="chip__count">{member.count}</span>
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      <h3 class="section-title">{t('symbols.categories')}</h3>
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
              {category.entries.map((entry) => (
                <button
                  type="button"
                  class="sym"
                  key={entry.codePoint}
                  title={`${entry.codePoint} · ${t('symbols.locate')}`}
                  onClick={() => locateFirst(entry.char)}
                >
                  <span class="sym__char">{entry.char}</span>
                  <span class="sym__code">{entry.codePoint}</span>
                  <span class="sym__count">{entry.count}</span>
                </button>
              ))}
            </div>
          </section>
        ))}

      <p class="hint">{t('symbols.note')}</p>
    </div>
  );
}
