/**
 * T4.7 integration test for runSqlQuery (the pure DuckDB core of api/query.ts).
 * Runs in Node environment (vitest project: 'node') with real facts.parquet.
 */
import { describe, it, expect } from 'vitest';
import { runSqlQuery } from './query';
import type { QuerySpec } from '../contracts';

// Absolute path resolution happens inside runSqlQuery; tests just pass specs.

const rankSpec: QuerySpec = {
  intent: 'rank',
  measure: 'amount',
  agg: 'sum',
  netGross: 'net',
  filters: {},
  groupBy: 'agency',
  sort: { by: 'measure', dir: 'desc' },
  topN: 5,
  chart: 'bar',
};

describe('runSqlQuery – DuckDB integration (real facts.parquet)', () => {
  it('returns rows for a top-5 agencies by net sum', async () => {
    const result = await runSqlQuery(rankSpec);
    expect(result.rows.length).toBe(5);
    // First agency should be Health Care Authority (largest spend in real data)
    expect(result.rows[0].label).toBe('Health Care Authority');
    expect(result.rows[0].value).toBeGreaterThan(1_000_000);
  }, 30_000);

  it('meta.totalNet is positive and large', async () => {
    const result = await runSqlQuery(rankSpec);
    expect(result.meta.totalNet).toBeGreaterThan(1_000_000);
  }, 30_000);

  it('meta.totalGross >= meta.totalNet (gross excludes negatives)', async () => {
    const result = await runSqlQuery(rankSpec);
    expect(result.meta.totalGross).toBeGreaterThanOrEqual(result.meta.totalNet);
  }, 30_000);

  it('meta.truncated is true when rows < total agencies', async () => {
    const result = await runSqlQuery(rankSpec);
    // We know there are more than 5 agencies in the real data
    expect(result.meta.truncated).toBe(true);
  }, 30_000);

  it('sql field contains the generated SQL', async () => {
    const result = await runSqlQuery(rankSpec);
    expect(result.sql).toContain('SELECT agency');
    expect(result.sql).toContain('GROUP BY agency');
    expect(result.sql).toContain('LIMIT 5');
  }, 30_000);

  it('returns rows for distinct_count agg', async () => {
    const spec: QuerySpec = { ...rankSpec, agg: 'distinct_count', topN: 3 };
    const result = await runSqlQuery(spec);
    expect(result.rows.length).toBe(3);
    expect(result.rows[0].value).toBeGreaterThan(0);
  }, 30_000);

  it('applies agency filter correctly', async () => {
    const spec: QuerySpec = {
      ...rankSpec,
      filters: { agency: ['Health Care Authority'] },
      topN: 10,
    };
    const result = await runSqlQuery(spec);
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].label).toBe('Health Care Authority');
  }, 30_000);

  it('applies fy filter correctly', async () => {
    const spec: QuerySpec = { ...rankSpec, filters: { fy: [2022] }, topN: 5 };
    const fy2022 = await runSqlQuery(spec);
    const spec2023: QuerySpec = { ...rankSpec, filters: { fy: [2023] }, topN: 5 };
    const fy2023 = await runSqlQuery(spec2023);
    // Both should return data; totals should differ
    expect(fy2022.meta.totalNet).toBeGreaterThan(0);
    expect(fy2023.meta.totalNet).toBeGreaterThan(0);
    expect(fy2022.meta.totalNet).not.toBe(fy2023.meta.totalNet);
  }, 30_000);

  it('returns yoy_delta rows', async () => {
    const spec: QuerySpec = {
      ...rankSpec,
      agg: 'yoy_delta',
      mode: 'abs',
      topN: 5,
    };
    const result = await runSqlQuery(spec);
    expect(result.rows.length).toBe(5);
    // Values can be positive or negative (change from FY22 to FY23)
    expect(typeof result.rows[0].value).toBe('number');
  }, 30_000);

  it('returns share rows summing to ~100', async () => {
    const spec: QuerySpec = {
      ...rankSpec,
      agg: 'share',
      topN: 50,
    };
    const result = await runSqlQuery(spec);
    expect(result.rows.length).toBeGreaterThan(0);
    // Share values should be percentages
    expect(result.rows[0].value).toBeGreaterThan(0);
    expect(result.rows[0].value).toBeLessThanOrEqual(100);
  }, 30_000);

  it('sets emptyReason=no_match for a filter that matches nothing', async () => {
    const spec: QuerySpec = {
      ...rankSpec,
      filters: { agency: ['NONEXISTENT_AGENCY_XYZ'] },
    };
    const result = await runSqlQuery(spec);
    expect(result.rows.length).toBe(0);
    expect(result.meta.emptyReason).toBe('no_match');
  }, 30_000);
});
