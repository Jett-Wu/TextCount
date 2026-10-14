/**
 * Worker protocol for the analysis engine.
 *
 * Shared by `src/workers/analysis.worker.ts` and the coordinator in `src/app/appState.ts`.
 * Keeping the shape in one module is what makes the request/response pair type-check on both
 * sides of the `postMessage` boundary.
 */
import type { CountSettings } from '../core/rules';
import type { MatchResult } from '../core/search';
import type { SymbolReport } from '../core/symbols';
import type { TextStats } from '../core/count';

export interface AnalyzeRequest {
  kind: 'analyze';
  id: number;
  text: string;
  settings: CountSettings;
}

export interface FindRequest {
  kind: 'find';
  id: number;
  text: string;
  terms: string[];
  caseSensitive: boolean;
  maxPositions: number;
}

export interface SymbolsRequest {
  kind: 'symbols';
  id: number;
  text: string;
}

export type WorkerRequest = AnalyzeRequest | FindRequest | SymbolsRequest;

export interface AnalyzeResponse {
  kind: 'analyze';
  id: number;
  stats: TextStats;
}

export interface FindResponse {
  kind: 'find';
  id: number;
  results: MatchResult[];
}

export interface SymbolsResponse {
  kind: 'symbols';
  id: number;
  report: SymbolReport;
}

export interface WorkerErrorResponse {
  kind: 'error';
  id: number;
  message: string;
}

export type WorkerResponse = AnalyzeResponse | FindResponse | SymbolsResponse | WorkerErrorResponse;
