/**
 * Worker message contract, shared by `src/app/state.ts` and `src/workers/analysis.worker.ts`.
 * Keeping it in one module is what makes the request/response pair type-check on both sides of
 * the `postMessage` boundary.
 */

import type { CountSettings, TextStats } from '../core/count';
import type { FrequencyReport, FrequencyUnit, ParagraphReport } from '../core/insights';
import type { MatchResult } from '../core/search';
import type { SymbolReport } from '../core/symbols';

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

export interface InsightsRequest {
  kind: 'insights';
  id: number;
  text: string;
  /** Flattened rather than optional: `postMessage` payloads should not carry absent fields. */
  unit: FrequencyUnit;
  filterStopWords: boolean;
  maxEntries: number;
}

export type WorkerRequest =
  | AnalyzeRequest
  | FindRequest
  | SymbolsRequest
  | InsightsRequest;

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

export interface InsightsResponse {
  kind: 'insights';
  id: number;
  paragraphs: ParagraphReport;
  frequency: FrequencyReport;
}

export interface WorkerErrorResponse {
  kind: 'error';
  id: number;
  message: string;
}

export type WorkerResponse =
  | AnalyzeResponse
  | FindResponse
  | SymbolsResponse
  | InsightsResponse
  | WorkerErrorResponse;
