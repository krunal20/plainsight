import type { QuerySpec, Cube, CubeCell, QueryResult } from '../../../contracts';
import { specToSql } from './specToSql';

// ---------------------------------------------------------------------------
// Stable hash for default traceId (deterministic, non-crypto)
// ---------------------------------------------------------------------------
function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}

// ---------------------------------------------------------------------------
// Dimension column access on a CubeCell
// ---------------------------------------------------------------------------
type CubeKey = 'agency' | 'category' | 'subcategory' | 'month' | 'fy';
const CUBE_KEY: Record<string, CubeKey> = {
  agency:      'agency',
  category:    'category',
  subcategory: 'subcategory',
  month:       'month',
  fy:          'fy',
};

function cellValue(cell: CubeCell, netGross: 'net' | 'gross'): number {
  return netGross === 'gross' ? cell.gross : cell.net;
}

// ---------------------------------------------------------------------------
// Filter cells according to spec.filters
// ---------------------------------------------------------------------------
function applyFilters(cells: CubeCell[], filters: QuerySpec['filters']): CubeCell[] {
  return cells.filter(c => {
    if (filters.agency?.length    && !filters.agency.includes(c.agency))         return false;
    if (filters.category?.length  && !filters.category.includes(c.category))     return false;
    if (filters.subcategory?.length && !filters.subcategory.includes(c.subcategory)) return false;
    if (filters.fy?.length        && !filters.fy.includes(c.fy))                 return false;
    if (filters.monthRange) {
      const [lo, hi] = filters.monthRange;
      if (c.month < lo || c.month > hi) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Aggregate cells grouped by a dimension key
// ---------------------------------------------------------------------------
function aggregateByKey(
  cells: CubeCell[],
  key: CubeKey,
  netGross: 'net' | 'gross',
  agg: QuerySpec['agg'],
  windowTotal: number,
  mode?: QuerySpec['mode']
): Map<string, number> {
  const groups = new Map<string, number>();
  const counts = new Map<string, number>();

  for (const cell of cells) {
    const label = String(cell[key]);
    const v = cellValue(cell, netGross);
    groups.set(label, (groups.get(label) ?? 0) + v);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  if (agg === 'share') {
    const result = new Map<string, number>();
    for (const [label, sum] of groups) {
      // Fix #7: guard div-by-zero — if windowTotal is 0, yield 0 share.
      result.set(label, windowTotal > 0 ? +((sum * 100) / windowTotal).toFixed(4) : 0);
    }
    return result;
  }

  if (agg === 'avg') {
    const result = new Map<string, number>();
    for (const [label, sum] of groups) {
      result.set(label, sum / (counts.get(label) ?? 1));
    }
    return result;
  }

  // yoy_delta: pivot FY2022 vs FY2023
  if (agg === 'yoy_delta') {
    const fy22 = new Map<string, number>();
    const fy23 = new Map<string, number>();
    for (const cell of cells) {
      const label = String(cell[key]);
      const v = cellValue(cell, netGross);
      if (cell.fy === 2022) fy22.set(label, (fy22.get(label) ?? 0) + v);
      if (cell.fy === 2023) fy23.set(label, (fy23.get(label) ?? 0) + v);
    }
    const allKeys = new Set([...fy22.keys(), ...fy23.keys()]);
    const result = new Map<string, number>();
    for (const label of allKeys) {
      const v22 = fy22.get(label) ?? 0;
      const v23 = fy23.get(label) ?? 0;
      if (mode === 'pct') {
        // Fix #7: guard div-by-zero — if FY2022 is 0, return 0 instead of Infinity.
        const pct = v22 !== 0 ? +((v23 - v22) * 100 / v22).toFixed(4) : 0;
        result.set(label, pct);
      } else {
        result.set(label, v23 - v22);
      }
    }
    return result;
  }

  return groups; // sum / count (count uses sum of 1-per-cell, approximation for cube)
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------
function buildColumns(groupBy: QuerySpec['groupBy'], agg: QuerySpec['agg']) {
  const dimLabel =
    groupBy === 'agency'      ? 'Agency' :
    groupBy === 'category'    ? 'Category' :
    groupBy === 'subcategory' ? 'Subcategory' :
    groupBy === 'month'       ? 'Month' :
    groupBy === 'fy'          ? 'Fiscal Year' :
    'Label';

  const valueLabel =
    agg === 'share'        ? 'Share (%)' :
    agg === 'yoy_delta'    ? 'YoY Delta' :
    agg === 'distinct_count' ? 'Distinct Vendors' :
    'Net Spend';

  return [
    { key: 'label', label: dimLabel,   type: 'string'   as const },
    { key: 'value', label: valueLabel, type: 'currency' as const },
  ];
}

// ---------------------------------------------------------------------------
// cubeReader — pure, no I/O
// ---------------------------------------------------------------------------

/**
 * Answers a cube-answerable QuerySpec from the pre-aggregated Cube.
 * Produces a QueryResult with correct rows, meta, sql, and traceId.
 *
 * @param spec   - The query specification
 * @param cube   - The pre-aggregated Cube (from public/data/cube.json)
 * @param traceId - Optional explicit traceId; defaults to "cube-<hash>"
 */
export function cubeReader(spec: QuerySpec, cube: Cube, traceId?: string): QueryResult {
  const id = traceId ?? `cube-${simpleHash(JSON.stringify(spec))}`;
  const sql = specToSql(spec);

  // --- filter cells ---
  const filtered = applyFilters(cube.cells, spec.filters);

  // --- totals from ALL filtered cells (not subject to topN) ---
  let totalNet   = 0;
  let totalGross = 0;
  for (const c of filtered) {
    totalNet   += c.net;
    totalGross += c.gross;
  }

  // --- scalar KPI (no groupBy) ---
  if (!spec.groupBy) {
    const value = spec.netGross === 'gross' ? totalGross : totalNet;
    return {
      rows:    [{ label: 'total', value }],
      columns: [
        { key: 'label', label: 'KPI',   type: 'string'   },
        { key: 'value', label: 'Value', type: 'currency' },
      ],
      meta: {
        totalNet,
        totalGross,
        rowCount:  1,
        truncated: false,
      },
      spec,
      sql,
      traceId: id,
    };
  }

  // --- grouped aggregation ---
  const key = CUBE_KEY[spec.groupBy];
  const windowTotal = spec.netGross === 'gross' ? totalGross : totalNet;
  const grouped = aggregateByKey(filtered, key, spec.netGross, spec.agg, windowTotal, spec.mode);

  // --- build and sort rows ---
  let rows: { label: string; value: number }[] = Array.from(grouped.entries()).map(
    ([label, value]) => ({ label, value })
  );

  const sort = spec.sort ?? { by: 'measure', dir: 'desc' };
  rows.sort((a, b) => {
    const va = sort.by === 'measure' ? a.value : a.label;
    const vb = sort.by === 'measure' ? b.value : b.label;
    if (va < vb) return sort.dir === 'asc' ? -1 : 1;
    if (va > vb) return sort.dir === 'asc' ? 1 : -1;
    return 0;
  });

  // --- topN + truncation ---
  const topN = spec.topN ?? 10;
  const truncated = rows.length > topN;
  if (truncated) rows = rows.slice(0, topN);

  const emptyReason = rows.length === 0 ? ('no_match' as const) : undefined;

  return {
    rows,
    columns: buildColumns(spec.groupBy, spec.agg),
    meta: {
      totalNet,
      totalGross,
      rowCount:  rows.length,
      truncated,
      ...(emptyReason ? { emptyReason } : {}),
    },
    spec,
    sql,
    traceId: id,
  };
}
