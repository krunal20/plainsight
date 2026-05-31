import { describe, it, expect } from 'vitest';
import { cubeReader } from './cubeReader';
import cubeFixture from '../../../fixtures/cube.fixture.json';
import type { QuerySpec, Cube } from '../../../contracts';

const cube = cubeFixture as unknown as Cube;

const rankAgencySpec: QuerySpec = {
  intent: 'rank',
  measure: 'amount',
  agg: 'sum',
  netGross: 'net',
  filters: {},
  groupBy: 'agency',
  sort: { by: 'measure', dir: 'desc' },
  topN: 10,
  chart: 'bar',
};

describe('cubeReader', () => {
  it('returns rows sorted by net value desc for top agencies', () => {
    const result = cubeReader(rankAgencySpec, cube);
    // Fixture: DSHS net = 1245000+1580000+875000 = 3700000
    //           DOT net  = 2100000+640000+720000  = 3460000
    expect(result.rows).toHaveLength(2);
    // DOT has more net (2100000+640000+720000=3460000)?
    // Actually DSHS: 1245000+1580000+875000 = 3700000
    // DOT: 2100000+640000+720000 = 3460000
    // So DSHS first
    expect(result.rows[0].label).toBe('DSHS');
    expect(result.rows[0].value).toBe(3700000);
    expect(result.rows[1].label).toBe('DOT');
    expect(result.rows[1].value).toBe(3460000);
  });

  it('meta.totalNet matches fixture total', () => {
    const result = cubeReader(rankAgencySpec, cube);
    expect(result.meta.totalNet).toBe(cube.totals.net);
  });

  it('meta.totalGross matches fixture total', () => {
    const result = cubeReader(rankAgencySpec, cube);
    expect(result.meta.totalGross).toBe(cube.totals.gross);
  });

  it('meta.rowCount equals number of rows', () => {
    const result = cubeReader(rankAgencySpec, cube);
    expect(result.meta.rowCount).toBe(result.rows.length);
  });

  it('meta.truncated is false when rows <= topN', () => {
    const result = cubeReader(rankAgencySpec, cube);
    expect(result.meta.truncated).toBe(false);
  });

  it('meta.truncated is true when rows exceed topN', () => {
    const spec: QuerySpec = { ...rankAgencySpec, topN: 1 };
    const result = cubeReader(spec, cube);
    expect(result.rows).toHaveLength(1);
    expect(result.meta.truncated).toBe(true);
  });

  it('sql field is the output of specToSql(spec)', () => {
    const result = cubeReader(rankAgencySpec, cube);
    // Should contain expected SQL fragments
    expect(result.sql).toContain('SELECT agency');
    expect(result.sql).toContain('SUM(amount) AS value');
    expect(result.sql).toContain('GROUP BY agency');
  });

  it('traceId defaults to deterministic cube-<hash> form', () => {
    const result = cubeReader(rankAgencySpec, cube);
    expect(result.traceId).toMatch(/^cube-/);
  });

  it('accepts an explicit traceId', () => {
    const result = cubeReader(rankAgencySpec, cube, 'my-trace-123');
    expect(result.traceId).toBe('my-trace-123');
  });

  it('filters by agency', () => {
    const spec: QuerySpec = {
      ...rankAgencySpec,
      filters: { agency: ['DSHS'] },
    };
    const result = cubeReader(spec, cube);
    expect(result.rows.every(r => r.label === 'DSHS')).toBe(true);
    expect(result.rows).toHaveLength(1);
  });

  it('filters by fy', () => {
    const spec: QuerySpec = {
      ...rankAgencySpec,
      filters: { fy: [2022] },
    };
    const result = cubeReader(spec, cube);
    // DSHS 2022: 1245000+875000=2120000, DOT 2022: 2100000
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].label).toBe('DSHS');
    expect(result.rows[0].value).toBe(2120000);
  });

  it('groups by category', () => {
    const spec: QuerySpec = {
      ...rankAgencySpec,
      groupBy: 'category',
    };
    const result = cubeReader(spec, cube);
    // Professional Services: 1245000+1580000+2100000 = 4925000
    // IT: 875000+640000+720000 = 2235000
    expect(result.rows.map(r => r.label)).toContain('Professional Services');
    expect(result.rows.map(r => r.label)).toContain('IT');
    const ps = result.rows.find(r => r.label === 'Professional Services');
    expect(ps?.value).toBe(4925000);
  });

  it('scalar KPI (no groupBy) returns single row', () => {
    const spec: QuerySpec = {
      intent: 'total',
      measure: 'amount',
      agg: 'sum',
      netGross: 'net',
      filters: {},
      chart: 'kpi',
    };
    const result = cubeReader(spec, cube);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].label).toBe('total');
    expect(result.rows[0].value).toBe(cube.totals.net);
  });

  it('computes share percentages summing to ~100', () => {
    const spec: QuerySpec = {
      ...rankAgencySpec,
      agg: 'share',
      topN: 10,
    };
    const result = cubeReader(spec, cube);
    const total = result.rows.reduce((s, r) => s + r.value, 0);
    expect(Math.abs(total - 100)).toBeLessThan(0.01);
  });

  it('columns field has expected shape', () => {
    const result = cubeReader(rankAgencySpec, cube);
    expect(result.columns).toContainEqual(
      expect.objectContaining({ key: 'label', type: 'string' })
    );
    expect(result.columns).toContainEqual(
      expect.objectContaining({ key: 'value', type: 'currency' })
    );
  });

  it('spec is echoed back in the result', () => {
    const result = cubeReader(rankAgencySpec, cube);
    expect(result.spec).toEqual(rankAgencySpec);
  });
});
