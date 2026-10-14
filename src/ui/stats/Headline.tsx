/**
 * The three headline numbers, kept visible above both panes.
 *
 * They are always rendered — never swapped for a spinner — so the layout does not jump and the
 * user always sees the last known values for the current document. `computing` is reported
 * separately by the editor bar.
 */
import { appStore } from '../../app/appState';
import { useStore } from '../../app/store';
import { useTranslate } from '../../app/useTranslate';
import { NumberValue } from '../common/NumberValue';

export function Headline() {
  const t = useTranslate();
  const stats = useStore(appStore, (state) => state.stats);
  const metric = useStore(appStore, (state) => state.countSettings.primaryMetric);

  return (
    <section class="headline" role="group" aria-label={t('stats.detail')}>
      <div class="headline__cell headline__cell--lead">
        <span class="headline__label">{t(`headline.primary.${metric}`)}</span>
        <NumberValue value={stats.primary} class="headline__value" />
      </div>
      <div class="headline__cell">
        <span class="headline__label">{t('headline.graphemes')}</span>
        <NumberValue value={stats.graphemes} class="headline__value" />
        <span class="headline__note">{t('headline.graphemesNote')}</span>
      </div>
      <div class="headline__cell">
        <span class="headline__label">{t('headline.primary.charsNoSpace')}</span>
        <NumberValue value={stats.graphemesNoWhitespace} class="headline__value" />
      </div>
    </section>
  );
}
