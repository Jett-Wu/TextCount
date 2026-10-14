/**
 * The statistics tool: the detail table and the counting-rule menu.
 *
 * Metrics that would always read 0 for the current document stay hidden so the list does not
 * fill with noise, and they appear as soon as they are relevant.
 */

import { appStore, setCountSettings, useStore, useTranslate } from '../app/state';
import { PRIMARY_METRICS, type CountSettings, type PrimaryMetricId } from '../core/count';
import type { MessageKey } from '../locales';
import { NumberValue } from './common';

const METRIC_LABEL: Record<PrimaryMetricId, MessageKey> = {
  mixed: 'stats.rules.primary.mixed',
  han: 'stats.rules.primary.han',
  latinWords: 'stats.rules.primary.latinWords',
  charsNoSpace: 'stats.rules.primary.charsNoSpace',
};

/**
 * One explanation at a time, matching the selected metric. Showing all four turned the menu
 * into a wall of small print that pushed the numbers off screen.
 */
const METRIC_EXPLANATION: Record<PrimaryMetricId, MessageKey> = {
  mixed: 'stats.rules.explain.mixed',
  han: 'stats.rules.explain.han',
  latinWords: 'stats.rules.explain.latinWords',
  charsNoSpace: 'stats.rules.explain.charsNoSpace',
};

function RuleMenu() {
  const t = useTranslate();
  const settings = useStore(appStore, (state) => state.countSettings);
  const patch = (change: Partial<CountSettings>): void =>
    setCountSettings({ ...settings, ...change });

  return (
    <div class="rules" role="group" aria-label={t('stats.rules.open')}>
      <fieldset class="rules__group">
        <legend class="rules__legend">{t('stats.rules.primary')}</legend>
        {PRIMARY_METRICS.map((metric) => (
          <label class="rules__option" key={metric}>
            <input
              type="radio"
              name="primary-metric"
              value={metric}
              checked={settings.primaryMetric === metric}
              onChange={() => patch({ primaryMetric: metric })}
            />
            <span>{t(METRIC_LABEL[metric])}</span>
          </label>
        ))}
      </fieldset>

      <p class="rules__explain">{t(METRIC_EXPLANATION[settings.primaryMetric])}</p>

      <fieldset class="rules__group">
        <legend class="rules__legend">{t('stats.rules.options')}</legend>
        <label class="rules__option">
          <input
            type="checkbox"
            checked={settings.countDigitRuns}
            onChange={(event) => patch({ countDigitRuns: event.currentTarget.checked })}
          />
          <span>{t('stats.rules.digitRuns')}</span>
        </label>
        <label class="rules__option">
          <input
            type="checkbox"
            checked={settings.countPunctuation}
            onChange={(event) => patch({ countPunctuation: event.currentTarget.checked })}
          />
          <span>{t('stats.rules.punctuation')}</span>
        </label>
      </fieldset>

      <p class="rules__note">{t('stats.rules.note')}</p>
    </div>
  );
}

export function StatsPanel() {
  const t = useTranslate();
  const stats = useStore(appStore, (state) => state.stats);
  const rulesOpen = useStore(appStore, (state) => state.ruleMenuOpen);

  const rows: { key: MessageKey; value: number }[] = [
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
