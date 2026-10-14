/**
 * Application state, the single source of truth for the document, and the task coordinator.
 *
 * ## Why the text is not in the store
 *
 * The document can be several megabytes. Putting it in reactive state would make every keystroke
 * reconcile a huge string through the component tree. Instead:
 *
 *  - `currentText` is a module-level string, written only by `setText`;
 *  - the store holds only small derived values (counts, flags, settings);
 *  - every analysis result carries the `revision` it was computed from, and a result whose
 *    revision is no longer current is **discarded**, never displayed. This is what stops a slow
 *    worker response from overwriting the numbers for newer text.
 *
 * ## Scheduling
 *
 *  - Small documents are scanned inline on the main thread. Measured cost is far below one
 *    frame, so the numbers update in the same task as the keystroke.
 *  - Large documents are debounced and handed to a lazily created Web Worker, so typing,
 *    scrolling and tab switching stay responsive.
 *  - If the worker cannot be created or dies, the coordinator falls back to a main-thread scan
 *    rather than leaving the user without numbers, and records that the engine is degraded.
 */

import { EMPTY_STATS, analyzeText, type TextStats } from '../core/count';
import type { CountSettings } from '../core/rules';
import { findMatches, type MatchResult } from '../core/search';
import { analyzeSymbols, type SymbolReport } from '../core/symbols';
import type { LocaleId } from '../locales';
import type { WorkerRequest, WorkerResponse } from '../workers/protocol';
import {
  loadCountSettings,
  loadLocale,
  loadTheme,
  saveCountSettings,
  saveLocale,
  saveTheme,
  type ThemePreference,
} from './preferences';
import { Store } from './store';

export type { ThemePreference } from './preferences';

export type ToolId = 'stats' | 'search' | 'symbols';

export interface AppState {
  locale: LocaleId;
  theme: ThemePreference;
  activeTool: ToolId;
  aboutOpen: boolean;
  ruleMenuOpen: boolean;
  /** Increments on every document change. Analysis results carry the revision they belong to. */
  revision: number;
  textLength: number;
  /** True while a large document is still being analysed. */
  computing: boolean;
  /** True when the Web Worker path is in use for the current document size. */
  workerActive: boolean;
  /** True when the worker could not be used and scans run on the main thread. */
  engineDegraded: boolean;
  stats: TextStats;
  countSettings: CountSettings;
}

/**
 * Documents at or below this size (UTF-16 code units) are analysed inline. Measured at well
 * under a frame on a 2024-class laptop and on a mid-range phone, so the extra machinery of a
 * debounce plus a worker would only add latency.
 */
export const INLINE_ANALYSIS_LIMIT = 20_000;

/** Quiet period before a large document is handed to the worker. */
const LARGE_TEXT_DEBOUNCE_MS = 120;

/** Positions retained per search term; the reported count is always exact. */
export const MAX_SEARCH_POSITIONS = 500;

export const appStore = new Store<AppState>({
  locale: loadLocale(),
  theme: loadTheme(),
  activeTool: 'stats',
  aboutOpen: false,
  ruleMenuOpen: false,
  revision: 0,
  textLength: 0,
  computing: false,
  workerActive: false,
  engineDegraded: false,
  stats: EMPTY_STATS,
  countSettings: loadCountSettings(),
});

/** The document. Module-level on purpose — see the module comment. */
let currentText = '';
let revision = 0;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function getText(): string {
  return currentText;
}

export function getRevision(): number {
  return revision;
}

/* ------------------------------------------------------------------ *
 * Worker plumbing
 * ------------------------------------------------------------------ */

interface PendingRequest {
  resolve: (response: WorkerResponse) => void;
  reject: (error: unknown) => void;
}

let worker: Worker | null = null;
let workerUnavailable = false;
let nextRequestId = 1;
const pending = new Map<number, PendingRequest>();

function failAllPending(reason: unknown): void {
  const waiting = [...pending.values()];
  pending.clear();
  for (const request of waiting) request.reject(reason);
}

function handleWorkerMessage(event: MessageEvent<WorkerResponse>): void {
  const response = event.data;
  const request = pending.get(response.id);
  if (request === undefined) return;
  pending.delete(response.id);
  if (response.kind === 'error') request.reject(new Error(response.message));
  else request.resolve(response);
}

function getWorker(): Worker | null {
  if (workerUnavailable) return null;
  if (worker !== null) return worker;
  try {
    worker = new Worker(new URL('../workers/analysis.worker.ts', import.meta.url), {
      type: 'module',
      name: 'textcount-analysis',
    });
    worker.onmessage = handleWorkerMessage;
    worker.onerror = () => {
      // A failed worker module (bad path after deploy, CSP, unsupported browser) must degrade,
      // not silently freeze the numbers.
      workerUnavailable = true;
      worker?.terminate();
      worker = null;
      appStore.set({ engineDegraded: true, workerActive: false });
      failAllPending(new Error('analysis worker failed'));
    };
  } catch {
    workerUnavailable = true;
    appStore.set({ engineDegraded: true, workerActive: false });
    return null;
  }
  return worker;
}

/**
 * `Omit` over a union collapses the union into a single object type, which loses the
 * discriminating members. Distributing it keeps each request variant intact at the call site,
 * so `postToWorker` rejects a `find` payload that is missing `terms`.
 */
type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;

function postToWorker<R extends WorkerResponse>(
  workerInstance: Worker,
  request: WithoutId<WorkerRequest>,
): Promise<R> {
  const id = nextRequestId++;
  return new Promise<R>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (response: WorkerResponse) => void, reject });
    workerInstance.postMessage({ ...request, id } as WorkerRequest);
  });
}

/* ------------------------------------------------------------------ *
 * Text and analysis
 * ------------------------------------------------------------------ */

function applyStats(stats: TextStats, forRevision: number): void {
  if (forRevision !== revision) return; // A newer document exists; drop the stale result.
  appStore.set({ stats, computing: false });
}

async function analyzeInWorker(text: string, settings: CountSettings, forRevision: number): Promise<void> {
  const instance = getWorker();
  if (instance === null) {
    // Nothing to await: yield once so the "computing" state can paint, then scan.
    await Promise.resolve();
    if (forRevision === revision) applyStats(analyzeText(text, settings), forRevision);
    return;
  }
  appStore.set({ workerActive: true });
  try {
    const response = await postToWorker(instance, { kind: 'analyze', text, settings });
    if (response.kind === 'analyze') applyStats(response.stats, forRevision);
    else applyStats(analyzeText(text, settings), forRevision);
  } catch {
    if (forRevision === revision) applyStats(analyzeText(text, settings), forRevision);
  }
}

function scheduleAnalysis(): void {
  const text = currentText;
  const settings = appStore.get().countSettings;
  const forRevision = revision;

  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  if (text.length <= INLINE_ANALYSIS_LIMIT) {
    appStore.set({ workerActive: false });
    applyStats(analyzeText(text, settings), forRevision);
    return;
  }

  appStore.set({ computing: true });
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void analyzeInWorker(text, settings, forRevision);
  }, LARGE_TEXT_DEBOUNCE_MS);
}

/** Replaces the document. This is the only writer of the text. */
export function setText(next: string): void {
  if (next === currentText) return;
  currentText = next;
  revision += 1;
  appStore.set({ revision, textLength: next.length });
  scheduleAnalysis();
}

/** Forces a re-analysis of the current document (used when the counting rules change). */
export function reanalyze(): void {
  appStore.set({ computing: currentText.length > INLINE_ANALYSIS_LIMIT });
  scheduleAnalysis();
}

/* ------------------------------------------------------------------ *
 * On-demand analysis, also revision guarded
 * ------------------------------------------------------------------ */

/**
 * Runs a search against the current document.
 *
 * Returns `null` when the document changed while the search was running, in which case the
 * caller must discard its result rather than display numbers for text that no longer exists.
 */
export async function runFind(
  terms: readonly string[],
  caseSensitive: boolean,
): Promise<MatchResult[] | null> {
  const text = currentText;
  const forRevision = revision;
  const cleaned = terms.filter((term) => term.length > 0);

  if (cleaned.length === 0) return [];

  if (text.length <= INLINE_ANALYSIS_LIMIT) {
    const results = cleaned.map((term) =>
      findMatches(text, term, { caseSensitive, maxPositions: MAX_SEARCH_POSITIONS }),
    );
    return forRevision === revision ? results : null;
  }

  const instance = getWorker();
  if (instance === null) {
    const results = cleaned.map((term) =>
      findMatches(text, term, { caseSensitive, maxPositions: MAX_SEARCH_POSITIONS }),
    );
    return forRevision === revision ? results : null;
  }

  try {
    const response = await postToWorker(instance, {
      kind: 'find',
      text,
      terms: cleaned,
      caseSensitive,
      maxPositions: MAX_SEARCH_POSITIONS,
    });
    if (response.kind !== 'find') return null;
    return forRevision === revision ? response.results : null;
  } catch {
    const results = cleaned.map((term) =>
      findMatches(text, term, { caseSensitive, maxPositions: MAX_SEARCH_POSITIONS }),
    );
    return forRevision === revision ? results : null;
  }
}

/** Runs the full-width/half-width symbol analysis. `null` means "stale, discard". */
export async function runSymbols(): Promise<SymbolReport | null> {
  const text = currentText;
  const forRevision = revision;

  if (text.length <= INLINE_ANALYSIS_LIMIT) {
    const report = analyzeSymbols(text);
    return forRevision === revision ? report : null;
  }

  const instance = getWorker();
  if (instance === null) {
    const report = analyzeSymbols(text);
    return forRevision === revision ? report : null;
  }

  try {
    const response = await postToWorker(instance, { kind: 'symbols', text });
    if (response.kind !== 'symbols') return null;
    return forRevision === revision ? response.report : null;
  } catch {
    const report = analyzeSymbols(text);
    return forRevision === revision ? report : null;
  }
}

/* ------------------------------------------------------------------ *
 * Preferences
 * ------------------------------------------------------------------ */

export function setLocale(locale: LocaleId): void {
  if (locale === appStore.get().locale) return;
  appStore.set({ locale });
  saveLocale(locale);
  document.documentElement.setAttribute('lang', locale);
}

export function setTheme(theme: ThemePreference): void {
  appStore.set({ theme });
  saveTheme(theme);
  applyTheme(theme);
}

/** Resolves 'system' against `prefers-color-scheme` and writes it to the document element. */
export function applyTheme(theme: ThemePreference = appStore.get().theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

export function setCountSettings(next: CountSettings): void {
  appStore.set({ countSettings: next });
  saveCountSettings(next);
  reanalyze();
}

export function setActiveTool(tool: ToolId): void {
  appStore.set({ activeTool: tool, ruleMenuOpen: false });
}
