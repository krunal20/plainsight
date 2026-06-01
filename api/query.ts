/**
 * api/query.ts — Vercel serverless function (Node runtime).
 *
 * POST /api/query
 * Body: { spec: QuerySpec; traceId?: string }
 * Response: QueryResult | { error: ValidationError }
 *
 * Also exports `runSqlQuery` as a testable pure-ish function.
 */

import type { QuerySpec, QueryResult, ValidationError } from '../contracts';
import { dataFile } from './_dataPath';

// package.json has "type":"module"; Vercel compiles api/*.ts to CommonJS, so a
// STATIC import of the ESM-compiled src/lib/*.js throws ERR_REQUIRE_ESM at load.
// Load them DYNAMICALLY (works for ESM from CJS).
async function _specToSql() { return (await import('../src/lib/query/specToSql')).specToSql; }
async function _validateSpec() { return (await import('../src/lib/query/validateSpec')).validateSpec; }

// ---------------------------------------------------------------------------
// DuckDB singleton (module-level — reused across requests in the same process)
// ---------------------------------------------------------------------------
let _conn: Awaited<ReturnType<import('@duckdb/node-api').DuckDBInstance['connect']>> | null = null;

async function getConnection() {
  if (_conn) return _conn;
  const { DuckDBInstance } = await import('@duckdb/node-api');
  const inst = await DuckDBInstance.create(':memory:');
  _conn = await inst.connect();
  return _conn;
}

// ---------------------------------------------------------------------------
// Safe number conversion (DuckDB may return BigInt for COUNT)
// ---------------------------------------------------------------------------
function toNumber(v: unknown): number {
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'number') return v;
  return Number(v ?? 0);
}

// ---------------------------------------------------------------------------
// runSqlQuery — the testable core
// ---------------------------------------------------------------------------

/**
 * Executes a QuerySpec against facts.parquet via DuckDB.
 * Returns a QueryResult.
 *
 * This is the pure-ish core of the /api/query handler, exported for testing.
 */
export async function runSqlQuery(spec: QuerySpec): Promise<QueryResult> {
  // Resolve parquet path robustly (fix #2: serverless fs paths).
  // Use forward slashes so the DuckDB SQL string is portable (Windows paths break in SQL).
  const pPath = dataFile('facts.parquet').replace(/\\/g, '/');
  const specToSql = await _specToSql();
  const sql = specToSql(spec, `read_parquet('${pPath}')`);

  const conn = await getConnection();

  // --- execute main query ---
  const reader = await conn.runAndReadAll(sql);
  const raw = reader.getRowObjects();

  // --- convert BigInt → number, handle share queries (raw_value / window_total / value) ---
  // Fix #3: DuckDB returns BigInt for COUNT/distinct_count; coerce all values.
  const isShare = spec.agg === 'share';
  const groupKey = spec.groupBy ?? null;

  const rows: QueryResult['rows'] = raw.map(r => {
    const label = groupKey ? String((r as Record<string, unknown>)[groupKey] ?? '') : 'total';
    const value = toNumber((r as Record<string, unknown>)['value']);
    return { label, value };
  });

  // --- compute meta totals over the FILTERED data (same WHERE clause as the main query) ---
  // Re-use the same WHERE clause from the SQL by building a total query
  const filterSql = specToSql(
    // Scalar KPI spec with same filters → gives a single SUM(amount)
    { ...spec, groupBy: undefined, agg: 'sum', sort: undefined, topN: undefined, chart: 'kpi', intent: 'total' },
    `read_parquet('${pPath}')`
  );
  const filterGrossSql = specToSql(
    { ...spec, groupBy: undefined, agg: 'sum', netGross: 'gross', sort: undefined, topN: undefined, chart: 'kpi', intent: 'total' },
    `read_parquet('${pPath}')`
  );

  const totalNetReader   = await conn.runAndReadAll(filterSql);
  const totalGrossReader = await conn.runAndReadAll(filterGrossSql);

  const totalNet   = toNumber(totalNetReader.getRowObjects()[0]?.['value']);
  const totalGross = toNumber(totalGrossReader.getRowObjects()[0]?.['value']);

  // --- topN / truncation ---
  // The SQL already has LIMIT, but we need to know if there were more rows.
  const topN = spec.topN ?? 10;

  // Count distinct group values (from filtered data) to determine truncation
  let allCount = rows.length;
  if (groupKey && topN) {
    // Build a no-LIMIT version of the spec to get total group count
    const countSpec: QuerySpec = { ...spec, topN: undefined, sort: undefined };
    const countSql = specToSql(countSpec, `read_parquet('${pPath}')`);
    const countReader = await conn.runAndReadAll(`SELECT COUNT(*) AS n FROM (${countSql}) t`);
    allCount = toNumber(countReader.getRowObjects()[0]?.['n']);
  }

  const truncated = allCount > topN;
  const emptyReason = rows.length === 0 ? ('no_match' as const) : undefined;

  // --- build columns ---
  const dimLabel =
    spec.groupBy === 'agency'      ? 'Agency' :
    spec.groupBy === 'category'    ? 'Category' :
    spec.groupBy === 'subcategory' ? 'Subcategory' :
    spec.groupBy === 'vendor'      ? 'Vendor' :
    spec.groupBy === 'month'       ? 'Month' :
    spec.groupBy === 'fy'          ? 'Fiscal Year' :
    'Label';

  const columns: QueryResult['columns'] = [
    { key: 'label', label: dimLabel,    type: 'string'   },
    { key: 'value', label: isShare ? 'Share (%)' : 'Net Spend', type: 'currency' },
  ];

  return {
    rows,
    columns,
    meta: {
      totalNet,
      totalGross,
      rowCount: rows.length,
      truncated,
      ...(emptyReason ? { emptyReason } : {}),
    },
    spec,
    sql,
    traceId: `sql-${Date.now()}`,
  };
}

// ---------------------------------------------------------------------------
// Vercel handler
// ---------------------------------------------------------------------------

interface Req {
  method?: string;
  body?: unknown;
  json?: () => Promise<unknown>;
}

interface Res {
  status(code: number): Res;
  json(body: unknown): void;
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body: { spec?: QuerySpec; traceId?: string };
  try {
    body = typeof req.json === 'function'
      ? await req.json()
      : (req.body as typeof body);
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  if (!body?.spec) {
    res.status(400).json({ error: 'Missing spec' });
    return;
  }

  // Load dimensions for validation
  const { readFileSync } = await import('fs');
  const dims = JSON.parse(readFileSync(dataFile('dimensions.json'), 'utf8'));

  // Validate spec
  const validateSpec = await _validateSpec();
  const validation = validateSpec(body.spec, dims);
  if (!validation.ok) {
    const err: ValidationError = validation.error;
    res.status(422).json({ error: err });
    return;
  }

  try {
    const result = await runSqlQuery(validation.spec);
    if (body.traceId) {
      (result as Record<string, unknown>).traceId = body.traceId;
    }
    res.status(200).json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { code: 'schema', field: 'query', message: msg } });
  }
}

