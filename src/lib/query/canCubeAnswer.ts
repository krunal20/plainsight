import type { QuerySpec, Agg, Dimension } from '../../../contracts';

const CUBE_GROUPBY: Set<Dimension | undefined> = new Set([
  'agency', 'category', 'subcategory', 'month', 'fy', undefined,
]);

const CUBE_AGG: Set<Agg> = new Set(['sum', 'share', 'yoy_delta']);

/**
 * Returns true iff the query can be answered from the pre-aggregated cube
 * (no DuckDB / parquet access needed).
 *
 * Conditions (ALL must hold):
 *   1. groupBy ∈ {agency, category, subcategory, month, fy} or undefined
 *   2. agg ∈ {sum, share, yoy_delta}
 *   3. filters.vendorIds is absent (or undefined) — cube has no vendor-level rows
 */
export function canCubeAnswer(spec: QuerySpec): boolean {
  if (!CUBE_GROUPBY.has(spec.groupBy)) return false;
  if (!CUBE_AGG.has(spec.agg)) return false;
  if (spec.filters.vendorIds !== undefined) return false;
  return true;
}
