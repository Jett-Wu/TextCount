/**
 * Counting rules ("口径") for TextCount.
 *
 * The rule identifiers are the stable contract between the engine, the UI and the tests.
 * Human-readable labels live in `src/locales/` — the engine never produces user-facing prose.
 *
 * Bumping `RULES_VERSION` invalidates persisted preferences whose meaning changed.
 */

/** What the headline number counts. */
export type PrimaryMetricId =
  /** Han/Kana characters + Latin words + digit runs (+ optional punctuation). Default. */
  | 'mixed'
  /** Han characters only. */
  | 'han'
  /** Latin-script words only. */
  | 'latinWords'
  /** Grapheme clusters excluding whitespace. */
  | 'charsNoSpace';

export interface CountSettings {
  primaryMetric: PrimaryMetricId;
  /** Count a run of digits as one unit in the mixed metric. */
  countDigitRuns: boolean;
  /** Count every punctuation code point as one unit in the mixed metric. */
  countPunctuation: boolean;
}

export const PRIMARY_METRICS: readonly PrimaryMetricId[] = [
  'mixed',
  'han',
  'latinWords',
  'charsNoSpace',
];

export const DEFAULT_COUNT_SETTINGS: CountSettings = {
  primaryMetric: 'mixed',
  countDigitRuns: true,
  countPunctuation: false,
};

/** Increment whenever a rule definition changes in a way that alters a displayed number. */
export const RULES_VERSION = 1;

/**
 * Normalises untrusted input (e.g. a value read back from `localStorage`) into valid settings.
 * Unknown fields fall back to the documented defaults instead of throwing.
 */
export function normalizeCountSettings(value: unknown): CountSettings {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_COUNT_SETTINGS };
  const candidate = value as Record<string, unknown>;
  const metric = candidate['primaryMetric'];
  return {
    primaryMetric: PRIMARY_METRICS.includes(metric as PrimaryMetricId)
      ? (metric as PrimaryMetricId)
      : DEFAULT_COUNT_SETTINGS.primaryMetric,
    countDigitRuns:
      typeof candidate['countDigitRuns'] === 'boolean'
        ? candidate['countDigitRuns']
        : DEFAULT_COUNT_SETTINGS.countDigitRuns,
    countPunctuation:
      typeof candidate['countPunctuation'] === 'boolean'
        ? candidate['countPunctuation']
        : DEFAULT_COUNT_SETTINGS.countPunctuation,
  };
}

/** Structural equality, used to avoid recomputing when a settings object is replaced by a copy. */
export function countSettingsEqual(a: CountSettings, b: CountSettings): boolean {
  return (
    a.primaryMetric === b.primaryMetric &&
    a.countDigitRuns === b.countDigitRuns &&
    a.countPunctuation === b.countPunctuation
  );
}
