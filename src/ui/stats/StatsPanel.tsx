/**
 * The statistics tool panel: every number the engine produces, plus the rule menu.
 *
 * Nothing is hidden behind a second click except the rule explanations. Metrics that would
 * always read 0 for the current document (kana, other scripts) stay hidden so the list does not
 * fill with noise, but they appear as soon as they are relevant.
 */
import { appStore } from '../../app/appState';
import { useStore } from '../../app/store';
import { useTranslate } from '../../app/useTranslate';
import type { MessageKey } from '../../locales';
import { NumberValue } from '../common/NumberValue';
import { RuleMenu } from './RuleMenu';

type Row = { key: MessageKey; value: number };

export function StatsPanel() {
  const t = useTranslate();
  const stats = useStore(appStore, (state) => state.stats);
  const rulesOpen = useStore(appStore, (state) => state.ruleMenuOpen);

  const rows: Row[] = [
    { key: 'stats.metric.han', value: stats.han },
    { key: 'stats.metric.latinWords', value: stats.latinWords },
    { key: 'stats.metric.digitRuns', value: stats.digitRuns },
  ];
  if (stats.kana > 0) rows.push({ key: 'stats.metric.kana', value: stats.kana });
  if (stats.otherWords > 0) rows.push({ key: 'stats.metric.otherWords', value: stats.otherWords });
  rows.push(
    { key: 'stats.metric.punctuation', value: stats.punctuation },
    { key: 'stats.metric.graphemes', value: stats.graphemes },
    { key: 'stats.metric.whitespace', value: stats.whitespace },
    { key: 'stats.metric.lines', value: stats.lines },
    { key: 'stats.metric.paragraphs', value: stats.paragraphs },
    { key: 'stats.metric.utf16Length', value: stats.utf16Length },
  );

  return (
    <div class="panel-body">
      <button
        type="button"
        class="btn btn--wide"
        aria-expanded={rulesOpen}
        onClick={() => appStore.set({ ruleMenuOpen: !rulesOpen })}
      >
        {rulesOpen ? t('stats.rules.close') : t('stats.rules.open')}
      </button>

      {rulesOpen ? <RuleMenu /> : null}

      <h3 class="section-title">{t('stats.detail')}</h3>
      <dl class="metric-list">
        {rows.map((row) => (
          <div class="metric-list__row" key={row.key}>
            <dt class="metric-list__label">{t(row.key)}</dt>
            <dd class="metric-list__value">
              <NumberValue value={row.value} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
