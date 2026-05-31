import type { QuerySpec } from '../../../contracts';

// ---------- column maps ----------

/**
 * Maps Dimension values to SQL column names in the `facts` table.
 * The facts table schema: agency, category, subcategory, vendorId, fy, month, amount
 */
const DIM_COL: Record<string, string> = {
  agency:      'agency',
  category:    'category',
  subcategory: 'subcategory',
  vendor:      'vendorId',
  fy:          'fy',
  month:       'month',
};

// ---------- safe string literal helper ----------
// Escapes single quotes by doubling them (SQL-standard, DuckDB-compatible).
const sqlStr = (v: string): string => `'${String(v).replace(/'/g, "''")}'`;

// ---------- net/gross amount expression ----------

/**
 * net  = all rows (SUM of amount with no sign filter)
 * gross = only positive amounts (payments out, no credits)
 */
function amountExpr(netGross: 'net' | 'gross'): string {
  return netGross === 'gross'
    ? 'CASE WHEN amount > 0 THEN amount ELSE 0 END'
    : 'amount';
}

function sumExpr(netGross: 'net' | 'gross'): string {
  return `SUM(${amountExpr(netGross)})`;
}

// ---------- filter clause builder ----------

function buildWhere(filters: QuerySpec['filters']): string {
  const clauses: string[] = [];

  if (filters.fy?.length) {
    clauses.push(`fy IN (${filters.fy.join(', ')})`);
  }
  if (filters.agency?.length) {
    clauses.push(`agency IN (${filters.agency.map(sqlStr).join(', ')})`);
  }
  if (filters.category?.length) {
    clauses.push(`category IN (${filters.category.map(sqlStr).join(', ')})`);
  }
  if (filters.subcategory?.length) {
    clauses.push(`subcategory IN (${filters.subcategory.map(sqlStr).join(', ')})`);
  }
  if (filters.vendorIds?.length) {
    clauses.push(`vendorId IN (${filters.vendorIds.map(sqlStr).join(', ')})`);
  }
  if (filters.monthRange) {
    clauses.push(`month BETWEEN ${filters.monthRange[0]} AND ${filters.monthRange[1]}`);
  }

  return clauses.length ? `WHERE ${clauses.join('\n  AND ')}` : '';
}

// ---------- ORDER BY helper ----------

function buildOrder(spec: QuerySpec): string {
  if (!spec.sort) return '';
  const col = spec.sort.by === 'measure' ? 'value' : DIM_COL[spec.groupBy ?? 'agency'];
  return `ORDER BY ${col} ${spec.sort.dir.toUpperCase()}`;
}

// ---------- aggregate expression (for grouped queries) ----------

function aggExpr(spec: QuerySpec): string {
  const ng = spec.netGross;
  switch (spec.agg) {
    case 'sum':            return sumExpr(ng);
    case 'avg':            return `AVG(${amountExpr(ng)})`;
    case 'count':          return `COUNT(*)`;
    case 'distinct_count': return `COUNT(DISTINCT vendorId)`;
    case 'share':          return sumExpr(ng);   // numerator; window total added separately
    case 'yoy_delta':      return sumExpr(ng);   // pivot handled separately
    default:               return sumExpr(ng);
  }
}

// ---------- main entry point ----------

/**
 * Pure function: maps a QuerySpec to a deterministic SQL string.
 * Operates against `facts` table (or the provided alias).
 *
 * Used for:
 *   - DuckDB execution in /api/query
 *   - "Show the SQL" display in the UI
 */
export function specToSql(spec: QuerySpec, table = 'facts'): string {
  const where = buildWhere(spec.filters);

  // ── Scalar KPI ───────────────────────────────────────────────────────────
  if (!spec.groupBy && spec.agg !== 'yoy_delta' && spec.agg !== 'share') {
    const agg = aggExpr(spec);
    return [
      `SELECT ${agg} AS value`,
      `FROM ${table}`,
      where,
    ].filter(Boolean).join('\n');
  }

  // ── Share of total ───────────────────────────────────────────────────────
  if (spec.agg === 'share') {
    const agg = aggExpr(spec);
    const groupCol = spec.groupBy ? DIM_COL[spec.groupBy] : null;
    const selectDim = groupCol ? `${groupCol},\n  ` : '';
    const groupByClause = groupCol ? `GROUP BY ${groupCol}` : '';
    const windowTotal = `SUM(${agg}) OVER ()`;
    const orderClause = buildOrder(spec);
    const limitClause = spec.topN ? `LIMIT ${spec.topN}` : '';

    // Fix #7: guard div-by-zero — if window_total is 0, yield 0 share instead of NULL/error.
    return [
      `SELECT ${selectDim}${agg} AS raw_value,`,
      `  ${windowTotal} AS window_total,`,
      `  COALESCE(ROUND(${agg} * 100.0 / NULLIF(${windowTotal}, 0), 4), 0) AS value`,
      `FROM ${table}`,
      where,
      groupByClause,
      orderClause,
      limitClause,
    ].filter(Boolean).join('\n');
  }

  // ── YoY delta ────────────────────────────────────────────────────────────
  if (spec.agg === 'yoy_delta') {
    const groupCol = spec.groupBy ? DIM_COL[spec.groupBy] : 'agency';
    const mode = spec.mode ?? 'abs';
    const amtExpr = amountExpr(spec.netGross);
    const fy23 = `SUM(CASE WHEN fy = 2023 THEN ${amtExpr} ELSE 0 END)`;
    const fy22 = `SUM(CASE WHEN fy = 2022 THEN ${amtExpr} ELSE 0 END)`;
    const deltaExpr = mode === 'pct'
      ? `ROUND((${fy23} - ${fy22}) * 100.0 / NULLIF(${fy22}, 0), 4)`
      : `${fy23} - ${fy22}`;

    return [
      `SELECT ${groupCol},`,
      `  ${deltaExpr} AS value`,
      `FROM ${table}`,
      where,
      `GROUP BY ${groupCol}`,
      buildOrder(spec),
      spec.topN ? `LIMIT ${spec.topN}` : '',
    ].filter(Boolean).join('\n');
  }

  // ── Compare (pivot two values side by side) ──────────────────────────────
  if (spec.compare) {
    const { dimension, a, b } = spec.compare;
    const dimCol = DIM_COL[dimension];
    const groupCol = spec.groupBy ? DIM_COL[spec.groupBy] : 'agency';
    const amtExpr = amountExpr(spec.netGross);

    return [
      `SELECT ${groupCol},`,
      `  SUM(CASE WHEN ${dimCol} = ${sqlStr(a)} THEN ${amtExpr} ELSE 0 END) AS a_value,`,
      `  SUM(CASE WHEN ${dimCol} = ${sqlStr(b)} THEN ${amtExpr} ELSE 0 END) AS b_value`,
      `FROM ${table}`,
      where,
      `GROUP BY ${groupCol}`,
      buildOrder(spec),
      spec.topN ? `LIMIT ${spec.topN}` : '',
    ].filter(Boolean).join('\n');
  }

  // ── Grouped (rank / trend / breakdown) ───────────────────────────────────
  const groupCol = DIM_COL[spec.groupBy!];
  const agg = aggExpr(spec);

  return [
    `SELECT ${groupCol},`,
    `  ${agg} AS value`,
    `FROM ${table}`,
    where,
    `GROUP BY ${groupCol}`,
    buildOrder(spec),
    spec.topN ? `LIMIT ${spec.topN}` : '',
  ].filter(Boolean).join('\n');
}
