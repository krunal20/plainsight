import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runQuery } from './runQuery';
import cubeFixture from '../../../fixtures/cube.fixture.json';
import type { QuerySpec, Cube, QueryResult } from '../../../contracts';

const cube = cubeFixture as unknown as Cube;

// Spec that canCubeAnswer → true
const cubeSpec: QuerySpec = {
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

// Spec that canCubeAnswer → false (distinct_count)
const engineSpec: QuerySpec = {
  ...cubeSpec,
  agg: 'distinct_count',
};

describe('runQuery – cube path', () => {
  it('returns cubeReader result for cube-answerable spec', async () => {
    const result = await runQuery(cubeSpec, { cube });
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].label).toBe('DSHS');
    expect(result.meta.totalNet).toBe(cube.totals.net);
  });

  it('uses the provided traceId', async () => {
    const result = await runQuery(cubeSpec, { cube, traceId: 'test-trace' });
    expect(result.traceId).toBe('test-trace');
  });

  it('sets emptyReason to no_match when zero rows returned', async () => {
    const spec: QuerySpec = {
      ...cubeSpec,
      filters: { agency: ['NONEXISTENT'] },
    };
    const result = await runQuery(spec, { cube });
    expect(result.rows).toHaveLength(0);
    expect(result.meta.emptyReason).toBe('no_match');
  });
});

describe('runQuery – engine path (fetch mock)', () => {
  const mockResult: QueryResult = {
    rows: [{ label: 'DSHS', value: 3700000 }],
    columns: [
      { key: 'label', label: 'Agency', type: 'string' },
      { key: 'value', label: 'Net Spend', type: 'currency' },
    ],
    meta: { totalNet: 3700000, totalGross: 3900000, rowCount: 1, truncated: false },
    spec: engineSpec,
    sql: 'SELECT agency, COUNT(DISTINCT vendorId) AS value FROM facts GROUP BY agency ORDER BY value DESC LIMIT 10',
    traceId: 'server-trace-1',
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResult),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs to /api/query when canCubeAnswer is false', async () => {
    await runQuery(engineSpec, { cube });
    expect(fetch).toHaveBeenCalledWith(
      '/api/query',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ spec: engineSpec }),
      })
    );
  });

  it('returns the parsed QueryResult from the engine', async () => {
    const result = await runQuery(engineSpec, { cube });
    expect(result.rows).toEqual(mockResult.rows);
    expect(result.meta.totalNet).toBe(3700000);
  });

  it('passes traceId in request body when provided', async () => {
    await runQuery(engineSpec, { cube, traceId: 'my-trace' });
    const callArgs = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.traceId).toBe('my-trace');
  });
});
