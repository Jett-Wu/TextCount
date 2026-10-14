/**
 * Application state and the task coordinator.
 *
 * The document is deliberately NOT part of the reactive store. It can be several megabytes, and
 * putting it there would reconcile a huge string through the component tree on every keystroke.
 * Instead `currentText` is a module-level string written only by `setText`, the store holds
 * small derived values, and every analysis result carries the `revision` it was computed from.
 * A result whose revision is no longer current is discarded, never displayed — that is what
 * stops a slow worker response from overwriting the numbers for newer text.
 *
 * Small documents are scanned inline; large ones are debounced and handed to a lazily created
 * worker. If the worker is unavailable, the coordinator falls back to a main-thread scan and
 * records that the engine is degraded rather than leaving the user without numbers.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { EMPTY_STATS, analyzeText, normalizeCountSettings, type CountSettings, type TextStats } from '../core/count';
import { DEFAULT_MAX_POSITIONS, findMatchesMany, type MatchResult } from '../core/search';
import { analyzeSymbols, type SymbolReport } from '../core/symbols';
import {
  LOCALES,
  createTranslator,
  type LocaleId,
  type Translate,
} from '../locales';
import type { WorkerRequest, WorkerResponse } from '../workers/protocol';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ToolId = 'stats' | 'search' | 'symbols';

/** Documents at or below this size are analysed inline; measured well under one frame. */
export const INLINE_ANALYSIS_LIMIT = 20_000;

const LARGE_TEXT_DEBOUNCE_MS = 120;

const THEME_KEY = 'textcount.theme';
const LOCALE_KEY = 'textcount.locale';
const RULES_KEY = 'textcount.rules';

export interface AppState {
  locale: LocaleId;
  theme: ThemePreference;
  activeTool: ToolId;
  ruleMenuOpen: boolean;
  revision: number;
  textLength: number;
  computing: boolean;
  workerActive: boolean;
  engineDegraded: boolean;
  stats: TextStats;
  countSettings: CountSettings;
}

export type Listener = () => void;

/** Minimal observable store. `set` shallow-merges and notifies only on a real change. */
export class Store<T extends object> {
  private state: T;
  private readonly listeners = new Set<Listener>();

  constructor(initial: T) {
    this.state = initial;
  }

  get(): T {
    return this.state;
  }

  set(patch: Partial<T> | ((previous: T) => Partial<T>)): boolean {
    const resolved = typeof patch === 'function' ? patch(this.state) : patch;
    let changed = false;
    for (const key of Object.keys(resolved) as (keyof T)[]) {
      if (!Object.is(this.state[key], resolved[key])) {
        changed = true;
        break;
      }
    }
    if (!changed) return false;
    this.state = { ...this.state, ...resolved };
    for (const listener of [...this.listeners]) listener();
    return true;
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

/**
 * Subscribes to one slice. The selector must return a stable value for unchanged state, or the
 * component re-renders on every notification.
 */
export function useStore<T extends object, S>(store: Store<T>, selector: (state: T) => S): S {
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const [value, setValue] = useState<S>(() => selector(store.get()));

  useEffect(() => {
    const update = (): void => {
      const next = selectorRef.current(store.get());
      setValue((previous) => (Object.is(previous, next) ? previous : next));
    };
    update();
    return store.subscribe(update);
  }, [store]);

  return value;
}

/* ------------------------------------------------------------------ preferences */

function readPreference(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePreference(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode or storage disabled: the preference just does not persist */
  }
}

export function detectLocale(): LocaleId {
  try {
    const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const language of languages) {
      if (typeof language !== 'string') continue;
      if (language.toLowerCase().startsWith('zh')) return 'zh-CN';
      if (language.toLowerCase().startsWith('en')) return 'en';
    }
  } catch {
    /* no navigator: fall through */
  }
  return 'en';
}

function loadTheme(): ThemePreference {
  const stored = readPreference(THEME_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

function loadLocale(): LocaleId {
  const stored = readPreference(LOCALE_KEY);
  return stored !== null && (LOCALES as readonly string[]).includes(stored)
    ? (stored as LocaleId)
    : detectLocale();
}

function loadCountSettings(): CountSettings {
  const raw = readPreference(RULES_KEY);
  if (raw === null) return { ...normalizeCountSettings(null) };
  try {
    return normalizeCountSettings(JSON.parse(raw));
  } catch {
    return normalizeCountSettings(null);
  }
}

/* ------------------------------------------------------------------ store */

export const appStore = new Store<AppState>({
  locale: loadLocale(),
  theme: loadTheme(),
  activeTool: 'stats',
  ruleMenuOpen: false,
  revision: 0,
  textLength: 0,
  computing: false,
  workerActive: false,
  engineDegraded: false,
  stats: EMPTY_STATS,
  countSettings: loadCountSettings(),
});

let currentText = '';
let revision = 0;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function getText(): string {
  return currentText;
}

/* ------------------------------------------------------------------ worker */

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
      // A failed worker module (deploy path, CSP, unsupported browser) must degrade the engine,
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

/** `Omit` over a union collapses it, so it is distributed to keep each variant's payload typed. */
type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;

function postToWorker<R extends WorkerResponse>(
  instance: Worker,
  request: WithoutId<WorkerRequest>,
): Promise<R> {
  const id = nextRequestId++;
  return new Promise<R>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (response: WorkerResponse) => void, reject });
    instance.postMessage({ ...request, id } as WorkerRequest);
  });
}

/* ------------------------------------------------------------------ analysis */

function applyStats(stats: TextStats, forRevision: number): void {
  if (forRevision !== revision) return;
  appStore.set({ stats, computing: false });
}

async function analyzeInWorker(
  text: string,
  settings: CountSettings,
  forRevision: number,
): Promise<void> {
  const instance = getWorker();
  if (instance === null) {
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

/** Replaces the document. The only writer of the text. */
export function setText(next: string): void {
  if (next === currentText) return;
  currentText = next;
  revision += 1;
  appStore.set({ revision, textLength: next.length });
  scheduleAnalysis();
}

export function setCountSettings(next: CountSettings): void {
  appStore.set({ countSettings: next });
  writePreference(RULES_KEY, JSON.stringify(next));
  appStore.set({ computing: currentText.length > INLINE_ANALYSIS_LIMIT });
  scheduleAnalysis();
}

export function setActiveTool(tool: ToolId): void {
  appStore.set({ activeTool: tool, ruleMenuOpen: false });
}

export function setLocale(locale: LocaleId): void {
  if (locale === appStore.get().locale) return;
  appStore.set({ locale });
  writePreference(LOCALE_KEY, locale);
}

export function setTheme(theme: ThemePreference): void {
  appStore.set({ theme });
  writePreference(THEME_KEY, theme);
  applyTheme(theme);
}

/** Resolves 'system' against `prefers-color-scheme` via the document element. */
export function applyTheme(theme: ThemePreference = appStore.get().theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

/* ------------------------------------------------------------------ on-demand analysis */

/**
 * Searches the current document. Returns `null` when the document changed while the search was
 * running, so the caller discards a result that describes text which no longer exists.
 */
export async function runFind(
  terms: readonly string[],
  caseSensitive: boolean,
): Promise<MatchResult[] | null> {
  const text = currentText;
  const forRevision = revision;
  const cleaned = terms.filter((term) => term.length > 0);
  if (cleaned.length === 0) return [];

  const options = { caseSensitive, maxPositions: DEFAULT_MAX_POSITIONS };
  const locally = (): MatchResult[] => findMatchesMany(text, cleaned, options);

  if (text.length <= INLINE_ANALYSIS_LIMIT) {
    const results = locally();
    return forRevision === revision ? results : null;
  }

  const instance = getWorker();
  if (instance === null) {
    const results = locally();
    return forRevision === revision ? results : null;
  }

  try {
    const response = await postToWorker(instance, {
      kind: 'find',
      text,
      terms: cleaned,
      caseSensitive,
      maxPositions: DEFAULT_MAX_POSITIONS,
    });
    if (response.kind !== 'find') return null;
    return forRevision === revision ? response.results : null;
  } catch {
    const results = locally();
    return forRevision === revision ? results : null;
  }
}

/** Full-width / half-width analysis. `null` means "stale, discard". */
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

/* ------------------------------------------------------------------ i18n hooks */

export function useLocale(): LocaleId {
  return useStore(appStore, (state) => state.locale);
}

export function useTranslate(): Translate {
  const locale = useLocale();
  return useMemo(() => createTranslator(locale), [locale]);
}
