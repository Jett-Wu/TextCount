/**
 * The word cloud for the insights view. Loaded through a dynamic import, so this module and its
 * layout stay out of the first-load bundle.
 */

import type { JSX } from 'preact';
import { useEffect, useMemo, useRef } from 'preact/hooks';

export interface CloudWord {
  term: string;
  count: number;
}

export interface CloudLayout {
  /** Words that found a place. */
  placed: number;
  /** Words offered. */
  total: number;
}

export interface CloudPlacement {
  term: string;
  count: number;
  x: number;
  y: number;
  fontSize: number;
  /** Text box of the drawn word, excluding the layout padding. Used as its hit area. */
  width: number;
  height: number;
}

export interface CloudLayoutOptions {
  width: number;
  height: number;
  minFontSize: number;
  maxFontSize: number;
  /** Must match the font the component renders with, or the boxes are the wrong size. */
  fontFamily: string;
  /** Grows every box; 0 fits text against text with no daylight between. */
  padding?: number;
}

export interface CloudLayoutResult {
  placements: readonly CloudPlacement[];
  placed: number;
  total: number;
}

export interface WordCloudProps {
  /** Sorted by count descending. Already filtered by the caller. */
  words: readonly CloudWord[];
  width: number;
  height: number;
  minFontSize?: number;
  maxFontSize?: number;
  /** Called with the layout outcome so the caller can report dropped words honestly. */
  onLayout?: (layout: CloudLayout) => void;
  /** Called when a word is activated (click or Enter). */
  onSelect?: (term: string) => void;
  ariaLabel?: string;
}

interface MeasuredWord extends CloudWord {
  /** Supplied width in px; measured with the canvas when absent. */
  width?: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const SPIRAL_STEP_PX = 1.25;
const SPIRAL_ANGLE_RAD = 0.45;
const SPIRAL_MAX_STEPS = 12000;
/** The caller passes one entry per distinct term; this only bounds a hostile input. */
const MAX_WORDS = 128;
const DEFAULT_PADDING = 4;
const FALLBACK_FONT = 12;
/** Kept in sync with `--font-sans` in src/styles/tokens.css. */
const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif";
const EMPTY_RESULT: CloudLayoutResult = { placements: [], placed: 0, total: 0 };

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

/** Finite counts only: a NaN here would propagate into a NaN font size and lose the word. */
function finiteCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** `null` when there is no canvas to measure with, so the caller can fall back to a count. */
function measureWidth(text: string, fontSize: number, family: string): number | null {
  const context = measureContext();
  if (context === null) return null;
  context.font = `${fontSize}px ${family}`;
  return context.measureText(text).width;
}

/**
 * One shared 2D context: measuring in canvas keeps the layout off the layout engine — reading the
 * box of a live node per word would be a forced reflow per word.
 */
let measureCache: CanvasRenderingContext2D | null | undefined;

function measureContext(): CanvasRenderingContext2D | null {
  if (measureCache === undefined) {
    measureCache = document.createElement('canvas').getContext('2d');
  }
  return measureCache;
}

/**
 * Deterministic by construction: the spiral visits the same points in the same order and the input
 * order breaks every tie, so re-analysing the same text cannot make the cloud jump.
 */
export function computeCloudLayout(
  words: readonly MeasuredWord[],
  width: number,
  height: number,
  minFontSize: number,
  maxFontSize: number,
  options: { padding?: number; fontFamily?: string } = {},
): CloudLayoutResult {
  const padding = options.padding ?? DEFAULT_PADDING;
  const family = options.fontFamily ?? FONT_STACK;
  if (!(width > 0) || !(height > 0) || words.length === 0) return EMPTY_RESULT;

  const minSize = clamp(Number.isFinite(minFontSize) ? minFontSize : FALLBACK_FONT, 1, Math.max(height, 1));
  const maxSize = clamp(Math.max(Number.isFinite(maxFontSize) ? maxFontSize : minSize, minSize), minSize, Math.max(height, 1));

  // Duplicates: the first entry wins, which is the caller's highest count for that term.
  const seen = new Set<string>();
  const unique: MeasuredWord[] = [];
  for (const word of words) {
    const term = word.term.trim();
    if (term.length === 0 || seen.has(term)) continue;
    seen.add(term);
    unique.push({ term, count: finiteCount(word.count), ...(word.width === undefined ? {} : { width: word.width }) });
    if (unique.length >= MAX_WORDS) break;
  }
  if (unique.length === 0) return EMPTY_RESULT;

  let minCount = Number.POSITIVE_INFINITY;
  let maxCount = 0;
  for (const word of unique) {
    if (word.count < minCount) minCount = word.count;
    if (word.count > maxCount) maxCount = word.count;
  }
  // Square root: 4x the count reads as about 2x the size. All-equal counts take the top size
  // instead of dividing by a zero range.
  const spread = Math.sqrt(maxCount) - Math.sqrt(minCount);
  const sizeFor = (count: number): number => {
    if (spread <= 0) return maxSize;
    const t = (Math.sqrt(count) - Math.sqrt(minCount)) / spread;
    return minSize + (maxSize - minSize) * t;
  };

  const ranked = unique.map((word, index) => ({
    word,
    fontSize: sizeFor(word.count),
    index,
  }));
  // Largest first: the big words get the centre, the small ones fill the gaps that are left.
  ranked.sort((a, b) => b.fontSize - a.fontSize || a.index - b.index);

  const rects: Rect[] = [];
  const placements: CloudPlacement[] = [];
  const centreX = width / 2;
  const centreY = height / 2;

  for (const item of ranked) {
    const lineHeight = item.fontSize * 1.1;
    const boxW = item.word.width ?? measureWidth(item.word.term, item.fontSize, family) ?? item.word.term.length * item.fontSize * 0.6;
    const boxH = lineHeight;
    // Padding is folded into the stored box, so both the viewport test and the word-vs-word test
    // use one rectangle and adjacent words keep their 4px of daylight.
    const rectW = boxW + padding * 2;
    const rectH = boxH + padding * 2;
    if (rectW > width || rectH > height) continue;

    let found: Rect | null = null;
    for (let step = 0; step < SPIRAL_MAX_STEPS; step += 1) {
      const angle = step * SPIRAL_ANGLE_RAD;
      const radius = step * SPIRAL_STEP_PX;
      const x = centreX + radius * Math.cos(angle) - rectW / 2;
      const y = centreY + radius * Math.sin(angle) - rectH / 2;
      if (x < 0 || y < 0 || x + rectW > width || y + rectH > height) continue;
      const candidate: Rect = { x, y, w: rectW, h: rectH };
      let hit = false;
      for (const rect of rects) {
        if (
          candidate.x < rect.x + rect.w &&
          candidate.x + candidate.w > rect.x &&
          candidate.y < rect.y + rect.h &&
          candidate.y + candidate.h > rect.y
        ) {
          hit = true;
          break;
        }
      }
      if (hit) continue;
      found = candidate;
      break;
    }

    // No room inside the step budget: the word is dropped, and `placed < total` says so.
    if (found === null) continue;
    rects.push(found);
    placements.push({
      term: item.word.term,
      count: item.word.count,
      x: found.x + found.w / 2,
      y: found.y + found.h / 2,
      fontSize: item.fontSize,
      width: boxW,
      height: boxH,
    });
  }

  return { placements, placed: placements.length, total: unique.length };
}

export function WordCloud({
  words,
  width,
  height,
  minFontSize = 12,
  maxFontSize = 34,
  onLayout,
  onSelect,
  ariaLabel = 'Word cloud',
}: WordCloudProps): JSX.Element {
  const layout = useMemo(() => computeCloudLayout(words, width, height, minFontSize, maxFontSize), [
    words,
    width,
    height,
    minFontSize,
    maxFontSize,
  ]);

  // Held in a ref so a fresh parent callback cannot re-fire the report for an unchanged layout.
  const report = useRef(onLayout);
  const select = useRef(onSelect);
  report.current = onLayout;
  select.current = onSelect;

  useEffect(() => {
    report.current?.({ placed: layout.placed, total: layout.total });
  }, [layout]);

  const scale = Math.max(maxFontSize - minFontSize, 1);
  if (!(width > 0) || !(height > 0) || words.length === 0) return <></>;

  return (
    // Not `cloud`: the panel wraps this in its own `.cloud` container.
    <svg class="cloud__svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
      {layout.placements.map((placement) => {
        const key = `${placement.term}:${placement.x}`;
        const label = `${placement.term}: ${placement.count}`;
        const activate = (): void => select.current?.(placement.term);
        return (
          <g
            key={key}
            class="cloud__word"
            role="button"
            tabIndex={0}
            aria-label={label}
            onClick={activate}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              activate();
            }}
          >
            {/*
             * A transparent rectangle supplies the hit area. Hit-testing an SVG `<text>` follows
             * the glyph box, so a click landing between two glyphs — the exact centre of `工具`,
             * for instance — misses the word entirely in some engines: it looks clickable and
             * does nothing.
             */}
            <rect
              x={placement.x - placement.width / 2}
              y={placement.y - placement.height / 2}
              width={placement.width}
              height={placement.height}
              fill="transparent"
            />
            <text
              x={placement.x}
              y={placement.y}
              fontSize={placement.fontSize}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="currentColor"
              // Opacity, not colour: it rides on the inherited ink, so both themes stay readable.
              fillOpacity={0.55 + (0.45 * (placement.fontSize - minFontSize)) / scale}
            >
              <title>{label}</title>
              {placement.term}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
