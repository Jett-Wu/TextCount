/**
 * Analysis worker.
 *
 * It owns no state of its own: every request carries the text it should analyse and the
 * revision-stamped id it belongs to. That keeps the worker free of any notion of "current
 * text", so a slow request can never be mistaken for a fresh result — the coordinator on the
 * main thread is the only place that decides which response is still relevant.
 *
 * The worker is created lazily and only for texts large enough that running the scan on the
 * main thread would be felt as input latency. See `src/app/appState.ts`.
 */
import { analyzeText } from '../core/count';
import { findMatches } from '../core/search';
import { analyzeSymbols } from '../core/symbols';
import type { WorkerRequest, WorkerResponse } from './protocol';

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse) => void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (event: MessageEvent<WorkerRequest>): void => {
  const request = event.data;
  try {
    switch (request.kind) {
      case 'analyze':
        scope.postMessage({
          kind: 'analyze',
          id: request.id,
          stats: analyzeText(request.text, request.settings),
        });
        return;
      case 'find':
        scope.postMessage({
          kind: 'find',
          id: request.id,
          results: request.terms.map((term) =>
            findMatches(request.text, term, {
              caseSensitive: request.caseSensitive,
              maxPositions: request.maxPositions,
            }),
          ),
        });
        return;
      case 'symbols':
        scope.postMessage({
          kind: 'symbols',
          id: request.id,
          report: analyzeSymbols(request.text),
        });
        return;
      default:
        scope.postMessage({
          kind: 'error',
          id: -1,
          message: `unsupported request: ${String((request as { kind?: unknown }).kind)}`,
        });
        return;
    }
  } catch (error) {
    scope.postMessage({
      kind: 'error',
      id: request.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
