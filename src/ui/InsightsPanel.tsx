/**
 * P1 analysis: paragraph distribution, word frequency and the word cloud.
 *
 * All three derive from the same document and the same `revision`, and all three are computed on
 * demand — the panel only mounts while its tool is open, and nothing here runs for a user who
 * never opens it. The cloud is additionally code-split, so its layout code never enters the
 * first-load bundle.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentType } from 'preact';
import { locateFirst, revealRange } from '../app/editor';
import {
  appStore,
  runInsights,
  useStore,
  useTranslate,
  type InsightsResult,
} from '../app/state';
import type { FrequencyUnit } from '../core/insights';
import type { MessageKey } from '../locales';
import type { CloudWord, WordCloudProps } from './WordCloud';

const ANALYSIS_DEBOUNCE_MS = 200;
/** Rows rendered at once. Far more than this and the panel becomes a scroll marathon. */
const PARAGRAPH_ROWS = 60;
const FREQUENCY_ROWS = 40;
/** The design reference suggests 30–60 words; 30 is what breathes in a 390px-wide panel. */
const CLOUD_WORDS = 30;
const CLOUD_HEIGHT = 300;

type InsightView = 'paragraphs' | 'frequency' | 'cloud';
type ParagraphOrder = 'document' | 'length';
type Status = 'idle' | 'running' | 'done';

const VIEWS: readonly InsightView[] = ['paragraphs', 'frequency', 'cloud'];
const ORDER: readonly ParagraphOrder[] = ['document', 'length'];
const UNITS: readonly FrequencyUnit[] = ['word', 'character'];

const VIEW_LABEL: Record<InsightView, MessageKey> = {
  paragraphs: 'insights.view.paragraphs',
  frequency: 'insights.view.frequency',
  cloud: 'insights.view.cloud',
};

/** Width of whatever it is attached to, kept current through resizes and panel reflows. */
function useElementWidth<T extends HTMLElement>(ref: { current: T | null }): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (element === null) return undefined;
    const update = (): void => setWidth(element.clientWidth);
    update();
    if (typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

export function InsightsPanel() {
  const t = useTranslate();
  const revision = useStore(appStore, (state) => state.revision);
  const textLength = useStore(appStore, (state) => state.textLength);
  const [view, setView] = useState<InsightView>('paragraphs');
  const [order, setOrder] = useState<ParagraphOrder>('document');
  const [unit, setUnit] = useState<FrequencyUnit>('word');
  const [filterStopWords, setFilterStopWords] = useState(true);
  const [data, setData] = useState<InsightsResult | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [placed, setPlaced] = useState<{ placed: number; total: number } | null>(null);

  useEffect(() => {
    if (textLength === 0) {
      setData(null);
      setStatus('idle');
      return undefined;
    }
    let cancelled = false;
    setStatus('running');
    const handle = setTimeout(() => {
      // `null` means the document changed mid-flight; that result describes text which no longer
      // exists, so it is discarded rather than displayed.
      void runInsights(unit, filterStopWords).then((found) => {
        if (cancelled || found === null) return;
        setData(found);
        setStatus('done');
      });
    }, ANALYSIS_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [revision, textLength, unit, filterStopWords]);

  return (
    <div class="panel-body">
      <div
        class="switcher switcher--sub"
        role="group"
        aria-label={t('tool.insights')}
        data-testid="insights-views"
      >
        {VIEWS.map((id) => (
          <button
            key={id}
            type="button"
            class={id === view ? 'switcher__item switcher__item--on' : 'switcher__item'}
            aria-pressed={id === view}
            onClick={() => setView(id)}
          >
            {t(VIEW_LABEL[id])}
          </button>
        ))}
      </div>

      {textLength === 0 ? <p class="panel-empty">{t('insights.empty')}</p> : null}

      {textLength > 0 && data === null ? (
        <p class="hint hint--busy">{t('insights.running')}</p>
      ) : null}

      {data !== null ? (
        <>
          {status === 'running' ? <p class="hint hint--busy">{t('insights.running')}</p> : null}

          {view === 'paragraphs' ? (
            <ParagraphView report={data} order={order} onOrder={setOrder} />
          ) : null}

          {view === 'frequency' ? (
            <FrequencyView
              report={data}
              unit={unit}
              filterStopWords={filterStopWords}
              onUnit={setUnit}
              onFilter={setFilterStopWords}
            />
          ) : null}

          {view === 'cloud' ? (
            <CloudView report={data} placed={placed} onPlaced={setPlaced} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function ParagraphView({
  report,
  order,
  onOrder,
}: {
  report: InsightsResult;
  order: ParagraphOrder;
  onOrder: (next: ParagraphOrder) => void;
}) {
  const t = useTranslate();
  const { paragraphs, count, average, longest, blankLines, truncated } = report.paragraphs;

  const rows = useMemo(
    () =>
      order === 'length'
        ? [...paragraphs].sort((a, b) => b.graphemes - a.graphemes)
        : paragraphs,
    [paragraphs, order],
  );
  const shown = rows.slice(0, PARAGRAPH_ROWS);
  const scale = Math.max(1, longest);

  return (
    <>
      <dl class="metrics metrics--inline">
        <div class="metrics__row">
          <dt class="metrics__label">{t('insights.paragraphs.count')}</dt>
          <dd class="metrics__value">{count}</dd>
        </div>
        <div class="metrics__row">
          <dt class="metrics__label">{t('insights.paragraphs.average')}</dt>
          <dd class="metrics__value">{average.toFixed(1)}</dd>
        </div>
        <div class="metrics__row">
          <dt class="metrics__label">{t('insights.paragraphs.longest')}</dt>
          <dd class="metrics__value">{longest}</dd>
        </div>
        <div class="metrics__row">
          <dt class="metrics__label">{t('insights.paragraphs.blank')}</dt>
          <dd class="metrics__value">{blankLines}</dd>
        </div>
      </dl>

      <div
        class="switcher switcher--sub switcher--plain"
        role="group"
        aria-label={t('insights.paragraphs.order')}
        data-testid="insights-order"
      >
        {ORDER.map((id) => (
          <button
            key={id}
            type="button"
            class={id === order ? 'switcher__item switcher__item--on' : 'switcher__item'}
            aria-pressed={id === order}
            onClick={() => onOrder(id)}
          >
            {t(id === 'document' ? 'insights.paragraphs.order.document' : 'insights.paragraphs.order.length')}
          </button>
        ))}
      </div>

      <ul class="bars">
        {shown.map((paragraph) => (
          <li key={paragraph.index}>
            <button
              type="button"
              class="bars__row"
              title={t('insights.paragraphs.locate')}
              onClick={() => revealRange(paragraph.start, paragraph.end)}
            >
              <span class="bars__index">{paragraph.index + 1}</span>
              <span class="bars__track">
                <span
                  class="bars__fill"
                  style={{ width: `${Math.max(2, (paragraph.graphemes / scale) * 100)}%` }}
                />
              </span>
              <span class="bars__value">{paragraph.graphemes}</span>
            </button>
          </li>
        ))}
      </ul>

      {truncated || count > PARAGRAPH_ROWS ? (
        <p class="hint">
          {t('insights.paragraphs.capped', { shown: Math.min(count, PARAGRAPH_ROWS), total: count })}
        </p>
      ) : null}
    </>
  );
}

function FrequencyView({
  report,
  unit,
  filterStopWords,
  onUnit,
  onFilter,
}: {
  report: InsightsResult;
  unit: FrequencyUnit;
  filterStopWords: boolean;
  onUnit: (next: FrequencyUnit) => void;
  onFilter: (next: boolean) => void;
}) {
  const t = useTranslate();
  const { entries, distinct, totalTokens, truncated, degraded } = report.frequency;
  const shown = entries.slice(0, FREQUENCY_ROWS);
  const top = entries[0]?.count ?? 1;

  return (
    <>
      <div
        class="switcher switcher--sub switcher--plain"
        role="group"
        aria-label={t('insights.frequency.unit')}
        data-testid="insights-unit"
      >
        {UNITS.map((id) => (
          <button
            key={id}
            type="button"
            class={id === unit ? 'switcher__item switcher__item--on' : 'switcher__item'}
            aria-pressed={id === unit}
            onClick={() => onUnit(id)}
          >
            {t(id === 'word' ? 'insights.frequency.unit.word' : 'insights.frequency.unit.character')}
          </button>
        ))}
      </div>

      {unit === 'word' ? (
        <>
          <label class="check">
            <input
              type="checkbox"
              checked={filterStopWords}
              onChange={(event) => onFilter(event.currentTarget.checked)}
            />
            <span>{t('insights.frequency.filter')}</span>
          </label>
          <p class="hint" data-testid="insights-engine-note">
            {t('insights.frequency.engineNote')}
          </p>
        </>
      ) : (
        <p class="hint">{t('insights.frequency.characterNote')}</p>
      )}

      {degraded ? (
        <p class="hint hint--warn" data-testid="insights-degraded">
          {t('insights.frequency.degraded')}
        </p>
      ) : null}

      <p class="hint" data-testid="insights-summary">
        {t('insights.frequency.summary', { tokens: totalTokens, distinct })}
      </p>

      <ul class="bars">
        {shown.map((entry, rank) => (
          <li key={entry.term}>
            <button
              type="button"
              class="bars__row"
              title={t('insights.frequency.locate')}
              onClick={() => locateFirst(entry.term, true)}
            >
              <span class="bars__index">{rank + 1}</span>
              <span class="bars__term">{entry.term}</span>
              <span class="bars__track">
                <span
                  class="bars__fill"
                  style={{ width: `${Math.max(2, (entry.count / top) * 100)}%` }}
                />
              </span>
              <span class="bars__value">{entry.count}</span>
            </button>
          </li>
        ))}
      </ul>

      {truncated || distinct > FREQUENCY_ROWS ? (
        <p class="hint">
          {t('insights.frequency.capped', {
            shown: Math.min(entries.length, FREQUENCY_ROWS),
            distinct,
          })}
        </p>
      ) : null}
    </>
  );
}

function CloudView({
  report,
  placed,
  onPlaced,
}: {
  report: InsightsResult;
  placed: { placed: number; total: number } | null;
  onPlaced: (next: { placed: number; total: number }) => void;
}) {
  const t = useTranslate();
  const holder = useRef<HTMLDivElement>(null);
  const width = useElementWidth(holder);
  const [cloudModule, setCloudModule] = useState<{
    WordCloud: ComponentType<WordCloudProps>;
  } | null>(null);

  // Code-split: the cloud is the only part of the app that needs a layout engine, so it is
  // fetched the first time somebody actually asks to see it.
  useEffect(() => {
    if (cloudModule !== null) return undefined;
    let cancelled = false;
    void import('./WordCloud').then((loaded) => {
      if (!cancelled) setCloudModule(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [cloudModule]);

  const words: CloudWord[] = report.frequency.entries
    .slice(0, CLOUD_WORDS)
    .map((entry) => ({ term: entry.term, count: entry.count }));

  if (report.frequency.entries.length === 0) {
    return <p class="panel-empty">{t('insights.cloud.empty')}</p>;
  }

  return (
    <>
      <div class="cloud" ref={holder}>
        {cloudModule === null || width === 0 ? (
          <p class="hint hint--busy">{t('insights.cloud.loading')}</p>
        ) : (
          <cloudModule.WordCloud
            words={words}
            width={width}
            height={CLOUD_HEIGHT}
            ariaLabel={t('insights.view.cloud')}
            onLayout={onPlaced}
            onSelect={(term) => locateFirst(term, true)}
          />
        )}
      </div>
      {placed !== null ? (
        <p class="hint">
          {t('insights.cloud.placed', { placed: placed.placed, total: placed.total })}
        </p>
      ) : null}
      <p class="hint">{t('insights.cloud.note')}</p>
      {/* The cloud is where a wrong word list looks most convincing, so the caveat travels with it. */}
      <p class="hint" data-testid="insights-engine-note">
        {t('insights.frequency.engineNote')}
      </p>
    </>
  );
}
