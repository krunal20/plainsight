import type { QuerySpec } from '../../../contracts';

// ---------- column maps ----------

const DIM_COL: Record<string, string> = {
  agency: 'agency',
  category: 'category',
  subcategory: 'subcategory',
  vendor: 'vendor_name',
  fy: 'fy',
  month: 'cal_month',
};

const AMOUNT_COL: Record<string, string> = {
  net: 'net',
  gross: 'gross',
};

// ---------- safe string literal helper ----------
// Escapes single quotes by doubling them (SQL-standard, DuckDB-compatible).
const sqlStr = (v: string): string => `'${String(v).replace(/'/g, "''")}'`;

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
    clauses.push(`vendor_id IN (${filters.vendorIds.map(sqlStr).join(', ')})`);
  }
  if (filters.monthRange) {
    clauses.push(`cal_month BETWEEN ${filters.monthRange[0]} AND ${filters.monthRange[1]}`);
  }

  return clauses.length ? `WHERE ${clauses.join('\n  AND ')}` : '';
}

// ---------- aggregate expression ----------

function aggExpr(spec: QuerySpec): string {
  const col = AMOUNT_COL[spec.netGross];
  switch (spec.agg) {
    case 'sum':            return `SUM(${col})`;
    case 'avg':            return `AVG(${col})`;
    case 'count':          return `COUNT(*)`;
    case 'distinct_count': return `COUNT(DISTINCT vendor_id)`;
    case 'share':          return `SUM(${col})`;   // numerator; window total added below
    case 'yoy_delta':      return `SUM(${col})`;   // pivot handled separately
    default:               return `SUM(${col})`;
  }
}

// ---------- main entry point ----------

export function specToSql(spec: QuerySpec, table = 'facts'): string {
  const where = buildWhere(spec.filters);
  const agg   = aggExpr(spec);
  const col   = AMOUNT_COL[spec.netGross];

  // ── Scalar KPI ───────────────────────────────────────────────────────────
  if (!spec.groupBy && spec.agg !== 'yoy_delta' && spec.agg !== 'share') {
    return [
      `SELECT ${agg} AS value`,
      `FROM ${table}`,
      where,
    ].filter(Boolean).join('\n');
  }

  // ── Share of total ───────────────────────────────────────────────────────
  if (spec.agg === 'share') {
    const groupCol = spec.groupBy ? DIM_COL[spec.groupBy] : null;
    const selectDim = groupCol ? `${groupCol},\n  ` : '';
    const groupByClause = groupCol ? `GROUP BY ${groupCol}` : '';
    const windowTotal = `SUM(SUM(${col})) OVER ()`;
    const orderClause = buildOrder(spec);
    const limitClause = spec.topN ? `LIMIT ${spec.topN}` : '';

    return [
      `SELECT ${selectDim}${agg} AS raw_value,`,
      `  ${windowTotal} AS window_total,`,
      `  ROUND(${agg} * 100.0 / ${windowTotal}, 4) AS value`,
      `FROM ${table}`,
      where,
      groupByClause,
      orderClause,
      limitClause,
    ].filter(Boolean).join('\n');
  }

  // ── YoY delta ────────────────────────────────────────────────────────────
  if (spec.agg === 'yoy_delta') {
    const groupCol = spec.groupBy ? DIM_COL[spec.groupBy] : null;
    const pivotDim = groupCol ?? 'agency';
    const mode = spec.mode ?? 'abs';
    const deltaExpr = mode === 'pct'
      ? `ROUND((SUM(CASE WHEN fy = 2023 THEN ${col} ELSE 0 END) - SUM(CASE WHEN fy = 2022 THEN ${col} ELSE 0 END)) * 100.0 / NULLIF(SUM(CASE WHEN fy = 2022 THEN ${col} ELSE 0 END), 0), 4)`
      : `SUM(CASE WHEN fy = 2023 THEN ${col} ELSE 0 END) - SUM(CASE WHEN fy = 2022 THEN ${col} ELSE 0 END)`;

    return [
      `SELECT ${pivotDim},`,
      `  ${deltaExpr} AS value`,
      `FROM ${table}`,
      where,
      `GROUP BY ${pivotDim}`,
      buildOrder(spec),
      spec.topN ? `LIMIT ${spec.topN}` : '',
    ].filter(Boolean).join('\n');
  }

  // ── Compare (pivot two values side by side) ───────────────────────────────
  if (spec.compare) {
    const { dimension, a, b } = spec.compare;
    const dimCol = DIM_COL[dimension];
    const groupCol = spec.groupBy ? DIM_COL[spec.groupBy] : 'agency';

    return [
      `SELECT ${groupCol},`,
      `  SUM(CASE WHEN ${dimCol} = ${sqlStr(a)} THEN ${col} ELSE 0 END) AS a_value,`,
      `  SUM(CASE WHEN ${dimCol} = ${sqlStr(b)} THEN ${col} ELSE 0 END) AS b_value`,
      `FROM ${table}`,
      where,
      `GROUP BY ${groupCol}`,
      buildOrder(spec),
      spec.topN ? `LIMIT ${spec.topN}` : '',
    ].filter(Boolean).join('\n');
  }

  // ── Grouped (rank / trend / breakdown) ───────────────────────────────────
  const groupCol = DIM_COL[spec.groupBy!];

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

function buildOrder(spec: QuerySpec): string {
  if (!spec.sort) return '';
  const col = spec.sort.by === 'measure' ? 'value' : DIM_COL[spec.groupBy ?? 'agency'];
  return `ORDER BY ${col} ${spec.sort.dir.toUpperCase()}`;
}
