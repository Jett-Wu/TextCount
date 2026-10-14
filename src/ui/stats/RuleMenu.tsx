/**
 * The counting-rule menu.
 *
 * Three controls, not fifteen. Every option is explained in place, and the panel states
 * explicitly that switching rules never edits the text — that is the guarantee the product
 * promise rests on.
 */
import { appStore, setCountSettings } from '../../app/appState';
import { PRIMARY_METRICS, type CountSettings, type PrimaryMetricId } from '../../core/rules';
import { useStore } from '../../app/store';
import { useTranslate } from '../../app/useTranslate';
import type { MessageKey } from '../../locales';

const METRIC_LABEL: Record<PrimaryMetricId, MessageKey> = {
  mixed: 'stats.rules.primary.mixed',
  han: 'stats.rules.primary.han',
  latinWords: 'stats.rules.primary.latinWords',
  charsNoSpace: 'stats.rules.primary.charsNoSpace',
};

export function RuleMenu() {
  const t = useTranslate();
  const settings = useStore(appStore, (state) => state.countSettings);

  const patch = (change: Partial<CountSettings>): void => {
    setCountSettings({ ...settings, ...change });
  };

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
        <legend class="rules__legend">{t('stats.detail')}</legend>
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
      <p class="rules__explain">{t('stats.rules.mixedExplanation')}</p>
      <p class="rules__explain">{t('stats.rules.charExplanation')}</p>
      <p class="rules__explain">{t('stats.rules.paragraphExplanation')}</p>
    </div>
  );
}
