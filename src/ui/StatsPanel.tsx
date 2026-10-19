/**
 * The statistics tool.
 *
 * Two habits this panel deliberately avoids: printing a dozen rows of `0` before the user has
 * typed anything, and ruling a line under every row. Rows are grouped by what they describe and
 * separated by spacing; the numbers alone carry the alignment.
 */

import { appStore, setCountSettings, useStore, useTranslate } from '../app/state';
import { PRIMARY_METRICS, type CountSettings, type PrimaryMetricId } from '../core/count';
import type { MessageKey } from '../locales';
import { Icon, NumberValue } from './common';

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

      <details class="inline-help rules__details">
        <summary>{t('stats.rules.definition')}</summary>
        <p class="rules__explain">{t(METRIC_EXPLANATION[settings.primaryMetric])}</p>
      </details>
    </div>
  );
}

interface Row {
  key: MessageKey;
  value: number;
  /** Optional rows stay hidden while they would only ever read 0. */
  optional?: boolean;
}

const COUNT_ROWS: Row[] = [
  { key: 'stats.metric.han', value: 0 },
  { key: 'stats.metric.latinWords', value: 0 },
  { key: 'stats.metric.digitRuns', value: 0 },
  { key: 'stats.metric.kana', value: 0, optional: true },
  { key: 'stats.metric.otherWords', value: 0, optional: true },
  { key: 'stats.metric.punctuation', value: 0 },
];

const STRUCTURE_ROWS: Row[] = [
  { key: 'stats.metric.graphemes', value: 0 },
  { key: 'headline.primary.charsNoSpace', value: 0 },
  { key: 'stats.metric.whitespace', value: 0 },
  { key: 'stats.metric.lines', value: 0 },
  { key: 'stats.metric.paragraphs', value: 0 },
  { key: 'stats.metric.utf16Length', value: 0 },
];

export function StatsPanel() {
  const t = useTranslate();
  const stats = useStore(appStore, (state) => state.stats);
  const rulesOpen = useStore(appStore, (state) => state.ruleMenuOpen);
  const textLength = useStore(appStore, (state) => state.textLength);

  const values: Record<string, number> = {
    'stats.metric.han': stats.han,
    'stats.metric.latinWords': stats.latinWords,
    'stats.metric.digitRuns': stats.digitRuns,
    'stats.metric.kana': stats.kana,
    'stats.metric.otherWords': stats.otherWords,
    'stats.metric.punctuation': stats.punctuation,
    'stats.metric.graphemes': stats.graphemes,
    'headline.primary.charsNoSpace': stats.graphemesNoWhitespace,
    'stats.metric.whitespace': stats.whitespace,
    'stats.metric.lines': stats.lines,
    'stats.metric.paragraphs': stats.paragraphs,
    'stats.metric.utf16Length': stats.utf16Length,
  };

  const visible = (rows: Row[]): Row[] =>
    rows.filter((row) => row.optional !== true || (values[row.key] ?? 0) > 0);

  const renderRows = (rows: Row[]) => (
    <dl class="metrics">
      {visible(rows).map((row) => (
        <div class="metrics__row" key={row.key}>
          <dt class="metrics__label">{t(row.key)}</dt>
          <dd class="metrics__value">
            <NumberValue value={values[row.key] ?? 0} />
          </dd>
        </div>
      ))}
    </dl>
  );

  return (
    <div class="panel-body">
      <div class="rule-control">
        <button
          type="button"
          class="rule-trigger"
          aria-expanded={rulesOpen}
          aria-controls="textcount-rules"
          onClick={() => appStore.set({ ruleMenuOpen: !rulesOpen })}
        >
          <span class="rule-trigger__label">{t('stats.rules.open')}</span>
          <span class="rule-trigger__chevron" aria-hidden="true">
            <Icon name="chevron" />
          </span>
        </button>

        {/* Keeping the small form mounted lets a closing transition reverse on the next click. */}
        <div id="textcount-rules" class={rulesOpen ? 'rules-reveal rules-reveal--open' : 'rules-reveal'}
          aria-hidden={!rulesOpen} inert={!rulesOpen}>
          <div class="rules-reveal__inner"><RuleMenu /></div>
        </div>
      </div>

      {textLength === 0 ? (
        <p class="panel-empty">{t('stats.emptyHint')}</p>
      ) : (
        <>
          <section class="metrics__group">
            {renderRows(COUNT_ROWS)}
          </section>
          <details class="more-stats">
            <summary>{t('stats.more')}<Icon name="chevron" /></summary>
            <section class="metrics__group">
            {renderRows(STRUCTURE_ROWS)}
            </section>
          </details>
        </>
      )}
    </div>
  );
}
