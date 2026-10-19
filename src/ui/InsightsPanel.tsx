/**
 * P1 analysis: paragraph distribution, word frequency and the word cloud.
 *
 * All three derive from the same document and the same `revision`, and all three are computed on
 * demand — the panel only mounts while its tool is open, and nothing here runs for a user who
 * never opens it. The cloud is additionally code-split, so its layout code never enters the
 * first-load bundle.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
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
import type { CloudWord } from './WordCloud';
import { useSelectionIndicator } from './common';

const ANALYSIS_DEBOUNCE_MS = 200;
/**
 * Rows painted before an explicit "show all". This is not a data limit — the whole list is in
 * memory and one click renders it. It exists because a book-length document can hold thousands of
 * paragraphs, and painting all of them on every keystroke-triggered re-analysis would cost more
 * than it is worth. It was 60 / 40, which cut ordinary reports off mid-list, which is the actual
 * complaint this threshold fixes: normal documents now show everything with no button at all.
 */
const LIST_PAGE = 300;
/**
 * How many terms go into the cloud. The design reference allows 30–60; 20 is added because a
 * smaller cloud is easier to read at a glance, and the point of the higher values is to dig, not to
 * decorate. Whatever the count, the layout reports how many it could actually place.
 */
const CLOUD_COUNTS = [20, 30, 40, 60] as const;
const CLOUD_SIZES = [
  { id: 'small', height: 220 },
  { id: 'medium', height: 300 },
  { id: 'large', height: 420 },
] as const;
type CloudSizeId = (typeof CLOUD_SIZES)[number]['id'];

type InsightView = 'paragraphs' | 'frequency' | 'cloud';
type ParagraphOrder = 'document' | 'length';
type Status = 'idle' | 'running' | 'done';

/**
 * Ordered by how often the view is actually opened, and the first entry is the default. The cloud
 * gives the instant "what is this text about" answer, the ranking is the drill-down, and the
 * paragraph list is for editing a specific paragraph — which is why it moved last.
 */
const VIEWS: readonly InsightView[] = ['cloud', 'frequency', 'paragraphs'];
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

export interface InsightSession {
  view: InsightView;
  order: ParagraphOrder;
  unit: FrequencyUnit;
  filterStopWords: boolean;
}

export function InsightsPanel({ session }: { session: { current: InsightSession } }) {
  const t = useTranslate();
  const revision = useStore(appStore, (state) => state.revision);
  const textLength = useStore(appStore, (state) => state.textLength);
  const [view, setView] = useState(session.current.view);
  const viewIndicator = useSelectionIndicator(view);
  const [order, setOrder] = useState(session.current.order);
  const [unit, setUnit] = useState(session.current.unit);
  const [filterStopWords, setFilterStopWords] = useState(session.current.filterStopWords);
  const [data, setData] = useState<InsightsResult | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [placed, setPlaced] = useState<{ placed: number; total: number } | null>(null);

  // The inactive panel stays unmounted, so remembering a view never starts background analysis.
  useLayoutEffect(() => {
    session.current = { view, order, unit, filterStopWords };
  }, [view, order, unit, filterStopWords]);

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
        ref={viewIndicator}
        class="switcher switcher--sub motion-track"
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
            /* Language-independent handle: the visible label is translated, the tests are not. */
            data-view={id}
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
  const [expanded, setExpanded] = useState(false);

  const rows = useMemo(
    () =>
      order === 'length'
        ? [...paragraphs].sort((a, b) => b.graphemes - a.graphemes)
        : paragraphs,
    [paragraphs, order],
  );
  const shown = expanded ? rows : rows.slice(0, LIST_PAGE);
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

      {/*
        Above the list, not below it: a "show all" button at the end of 300 rendered rows means
        scrolling 300 rows just to discover the rest exists, which is the complaint this fixes.
      */}
      {!expanded && rows.length > LIST_PAGE ? (
        <button
          type="button"
          class="btn btn--quiet"
          data-testid="insights-show-all"
          onClick={() => setExpanded(true)}
        >
          {t('insights.paragraphs.showAll', { total: rows.length })}
        </button>
      ) : null}

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

      {truncated ? (
        <p class="hint">
          {t('insights.paragraphs.capped', { shown: rows.length, total: count })}
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
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? entries : entries.slice(0, LIST_PAGE);
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

      {!expanded && entries.length > LIST_PAGE ? (
        <button
          type="button"
          class="btn btn--quiet"
          data-testid="insights-show-all"
          onClick={() => setExpanded(true)}
        >
          {t('insights.frequency.showAll', { total: entries.length })}
        </button>
      ) : null}

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

      {truncated ? (
        <p class="hint">
          {t('insights.frequency.capped', { shown: entries.length, distinct })}
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
  const [cloudModule, setCloudModule] = useState<typeof import('./WordCloud') | null>(null);
  const [count, setCount] = useState<number>(30);
  const [size, setSize] = useState<CloudSizeId>('medium');
  const [exporting, setExporting] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);

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

  const height = CLOUD_SIZES.find((option) => option.id === size)?.height ?? 300;
  /*
   * Memoised on purpose. WordCloud memoises its layout on `words`, and that layout drives an
   * effect which reports `{placed, total}` back up to this panel's state. A freshly built array on
   * every render therefore started a loop — render, new words, new layout, report, setState,
   * render — which starved the main thread badly enough that clicks on the controls above never
   * completed once the list grew to 70 terms.
   */
  const words = useMemo<CloudWord[]>(
    () =>
      report.frequency.entries.slice(0, count).map((entry) => ({
        term: entry.term,
        count: entry.count,
      })),
    [report.frequency.entries, count],
  );
  const ready = cloudModule !== null && width > 0;

  if (report.frequency.entries.length === 0) {
    return <p class="panel-empty">{t('insights.cloud.empty')}</p>;
  }

  const download = (kind: 'svg' | 'png'): void => {
    const svg = holder.current?.querySelector('svg');
    if (cloudModule === null || svg === null || svg === undefined) return;
    setExportFailed(false);
    const filename = `textcount-wordcloud.${kind}`;
    if (kind === 'svg') {
      cloudModule.exportCloudSvg(svg, filename);
      return;
    }
    setExporting(true);
    void cloudModule
      .exportCloudPng(svg, filename, 2)
      .catch(() => setExportFailed(true))
      .finally(() => setExporting(false));
  };

  return (
    <>
      {/*
       * Selection tracks and one-off downloads have different visual treatments so an export
       * never looks like another persistent setting. Both still yield to the canvas below.
       */}
      <div class="cloud-controls">
        <div class="cloud-control" role="group" aria-label={t('insights.cloud.count')} data-testid="cloud-count">
          <span class="cloud-control__label">{t('insights.cloud.count')}</span>
          <div class="cloud-control__options">
            {CLOUD_COUNTS.map((option) => (
              <button
                key={option}
                type="button"
                class={option === count ? 'cloud-option cloud-option--on' : 'cloud-option'}
                aria-pressed={option === count}
                onClick={() => setCount(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div class="cloud-control" role="group" aria-label={t('insights.cloud.size')} data-testid="cloud-size">
          <span class="cloud-control__label">{t('insights.cloud.size')}</span>
          <div class="cloud-control__options">
            {CLOUD_SIZES.map((option) => (
              <button
                key={option.id}
                type="button"
                class={option.id === size ? 'cloud-option cloud-option--on' : 'cloud-option'}
                aria-pressed={option.id === size}
                onClick={() => setSize(option.id)}
              >
                {t(`insights.cloud.size.${option.id}`)}
              </button>
            ))}
          </div>
        </div>

        <div class="cloud-control cloud-control--export" role="group" aria-label={t('insights.cloud.export')} data-testid="cloud-export">
          <span class="cloud-control__label">{t('insights.cloud.export')}</span>
          <div class="cloud-export-actions">
            <button
              type="button"
              class="cloud-download"
              disabled={!ready || exporting}
              title={t('insights.cloud.exportPngHint')}
              onClick={() => download('png')}
            >
              <svg class="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                <path d="M10 3v10m-4-4 4 4 4-4M4 14v3h12v-3" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              {t('insights.cloud.exportPng')}
            </button>
            <button
              type="button"
              class="cloud-download"
              disabled={!ready}
              title={t('insights.cloud.exportSvgHint')}
              onClick={() => download('svg')}
            >
              <svg class="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                <path d="M10 3v10m-4-4 4 4 4-4M4 14v3h12v-3" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              {t('insights.cloud.exportSvg')}
            </button>
          </div>
        </div>
      </div>

      <div class="cloud" ref={holder}>
        {cloudModule === null || width === 0 ? (
          <p class="hint hint--busy">{t('insights.cloud.loading')}</p>
        ) : (
          <cloudModule.WordCloud
            words={words}
            width={width}
            height={height}
            ariaLabel={t('insights.view.cloud')}
            onLayout={onPlaced}
            onSelect={(term) => locateFirst(term, true)}
          />
        )}
      </div>
      {exportFailed ? (
        <p class="hint hint--warn" data-testid="cloud-export-failed">
          {t('insights.cloud.exportFailed')}
        </p>
      ) : null}
      {placed !== null ? (
        <p
          class="hint"
          data-testid="cloud-placed"
          /* Machine-readable, so tests do not parse a translated sentence. */
          data-placed={placed.placed}
          data-total={placed.total}
        >
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
