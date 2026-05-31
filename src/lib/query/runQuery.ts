import type { QuerySpec, QueryResult, Cube } from '../../../contracts';
import { canCubeAnswer } from './canCubeAnswer';
import { cubeReader } from './cubeReader';

export interface RunQueryOptions {
  /** Pre-loaded cube (required for the cube path). */
  cube: Cube;
  /** Optional explicit traceId — passed through to result. */
  traceId?: string;
}

/**
 * Main query entry point.
 *
 * - If `canCubeAnswer(spec)` → answers from the pre-aggregated cube (pure, synchronous internally).
 * - Otherwise → POSTs `{spec, traceId}` to `/api/query` and returns the result.
 *
 * Always returns a `QueryResult`. Sets `meta.emptyReason = 'no_match'` when rows = 0.
 */
export async function runQuery(spec: QuerySpec, opts: RunQueryOptions): Promise<QueryResult> {
  const { cube, traceId } = opts;

  // ── Cube path ────────────────────────────────────────────────────────────
  if (canCubeAnswer(spec)) {
    const result = cubeReader(spec, cube, traceId);
    // Ensure emptyReason is set when no rows
    if (result.rows.length === 0 && !result.meta.emptyReason) {
      return {
        ...result,
        meta: { ...result.meta, emptyReason: 'no_match' },
      };
    }
    return result;
  }

  // ── Engine path (fetch) ──────────────────────────────────────────────────
  // Never throw a raw "invalid JSON" at the UI: if the serverless function is
  // unavailable, degrade to a graceful empty result the charts render cleanly.
  const emptyResult = (): QueryResult => ({
    rows: [],
    columns: [],
    meta: { totalNet: 0, totalGross: 0, rowCount: 0, truncated: false, emptyReason: 'no_match' },
    spec,
    sql: '',
    traceId: traceId ?? '',
  });

  try {
    const response = await fetch('/api/query', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ spec, ...(traceId ? { traceId } : {}) }),
    });
    if (!response.ok) return emptyResult();

    const data = (await response.json()) as QueryResult;
    if (!data || !Array.isArray(data.rows)) return emptyResult();

    // Ensure emptyReason is set when no rows
    if (data.rows.length === 0 && !data.meta?.emptyReason) {
      return { ...data, meta: { ...data.meta, emptyReason: 'no_match' } };
    }
    return data;
  } catch {
    return emptyResult();
  }
}
