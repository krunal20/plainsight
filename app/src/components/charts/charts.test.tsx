/**
 * WS3 Chart kit — pure option mapper tests + DataTable smoke test
 * No real ECharts canvas: we only call optionFromResult() and assert the
 * returned plain object.  DataTable is DOM-only so it can mount.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import fixtureBase from '../../../fixtures/result.fixture.json';
import type { QueryResult } from '../../../contracts/index';

import { kpiOption } from './Kpi';
import { barOption } from './Bar';
import { lineOption } from './Line';
import { treemapOption } from './Treemap';
import { donutOption } from './Donut';
import { heatmapOption } from './Heatmap';
import { DataTable } from './DataTable';

// Cast the imported JSON to QueryResult
const fixture = fixtureBase as QueryResult;

// A result with no rows, plus an emptyReason
const emptyResult: QueryResult = {
  ...fixture,
  rows: [],
  meta: { ...fixture.meta, rowCount: 0, emptyReason: 'no_match' },
};

// A line fixture with group fields (FY series)
const lineResult: QueryResult = {
  ...fixture,
  rows: [
    { label: 'Jan', value: 100, group: 'FY22' },
    { label: 'Feb', value: 200, group: 'FY22' },
    { label: 'Jan', value: 150, group: 'FY23' },
    { label: 'Feb', value: 250, group: 'FY23' },
  ],
  spec: { ...fixture.spec, chart: 'line', groupBy: 'month' },
};

// A heatmap fixture: rows carry label + group + value
const heatmapResult: QueryResult = {
  ...fixture,
  rows: [
    { label: 'DSHS', value: 500, group: 'Jan' },
    { label: 'DOT', value: 800, group: 'Feb' },
  ],
  spec: { ...fixture.spec, chart: 'heatmap' },
};

// ── KPI ─────────────────────────────────────────────────────────────────────

describe('kpiOption', () => {
  it('returns a series array with the first row value', () => {
    const opt = kpiOption(fixture);
    // KPI is a simple object; just check the value comes through
    expect(opt.value).toBe(fixture.rows[0].value);
  });

  it('empty: emptyReason propagated', () => {
    const opt = kpiOption(emptyResult);
    expect(opt.empty).toBe(true);
    expect(opt.emptyReason).toBe('no_match');
  });
});

// ── Bar ──────────────────────────────────────────────────────────────────────

describe('barOption', () => {
  it('xAxis data matches fixture labels', () => {
    const opt = barOption(fixture);
    const labels = fixture.rows.map(r => r.label);
    expect((opt.xAxis as { data: string[] }).data).toEqual(labels);
  });

  it('series data matches fixture values', () => {
    const opt = barOption(fixture);
    const series = (opt.series as Array<{ data: number[] }>)[0];
    expect(series.data).toEqual(fixture.rows.map(r => r.value));
  });

  it('empty: returns empty-state marker', () => {
    const opt = barOption(emptyResult);
    expect(opt.__empty).toBe(true);
  });
});

// ── Line ─────────────────────────────────────────────────────────────────────

describe('lineOption', () => {
  it('produces one series per group', () => {
    const opt = lineOption(lineResult);
    const series = opt.series as unknown[];
    // Two groups: FY22, FY23
    expect(series.length).toBe(2);
  });

  it('series data matches values for each group', () => {
    const opt = lineOption(lineResult);
    const series = opt.series as Array<{ name: string; data: number[] }>;
    const fy22 = series.find(s => s.name === 'FY22');
    expect(fy22?.data).toEqual([100, 200]);
  });

  it('empty: returns empty-state marker', () => {
    const opt = lineOption(emptyResult);
    expect(opt.__empty).toBe(true);
  });
});

// ── Treemap ──────────────────────────────────────────────────────────────────

describe('treemapOption', () => {
  it('series data name matches fixture labels', () => {
    const opt = treemapOption(fixture);
    const series = (opt.series as Array<{ data: Array<{ name: string; value: number }> }>)[0];
    expect(series.data[0].name).toBe('DSHS');
    expect(series.data[0].value).toBe(2700000);
  });

  it('empty: returns empty-state marker', () => {
    const opt = treemapOption(emptyResult);
    expect(opt.__empty).toBe(true);
  });
});

// ── Donut ─────────────────────────────────────────────────────────────────────

describe('donutOption', () => {
  it('series type is pie', () => {
    const opt = donutOption(fixture);
    const series = (opt.series as Array<{ type: string }>)[0];
    expect(series.type).toBe('pie');
  });

  it('series data has correct name/value pairs', () => {
    const opt = donutOption(fixture);
    const series = (opt.series as Array<{ data: Array<{ name: string; value: number }> }>)[0];
    expect(series.data[1].name).toBe('DOT');
    expect(series.data[1].value).toBe(4460000);
  });

  it('empty: returns empty-state marker', () => {
    const opt = donutOption(emptyResult);
    expect(opt.__empty).toBe(true);
  });
});

// ── Heatmap ──────────────────────────────────────────────────────────────────

describe('heatmapOption', () => {
  it('series type is heatmap', () => {
    const opt = heatmapOption(heatmapResult);
    const series = (opt.series as Array<{ type: string }>)[0];
    expect(series.type).toBe('heatmap');
  });

  it('series data encodes value correctly', () => {
    const opt = heatmapOption(heatmapResult);
    const series = (opt.series as Array<{ data: unknown[] }>)[0];
    expect(series.data.length).toBe(2);
  });

  it('empty: returns empty-state marker', () => {
    const opt = heatmapOption(emptyResult);
    expect(opt.__empty).toBe(true);
  });
});

// ── DataTable smoke test ──────────────────────────────────────────────────────

describe('DataTable', () => {
  it('renders a cell value from fixture rows', () => {
    render(
      <DataTable
        result={fixture}
        subtitle="Top agencies by net spend"
      />
    );
    // The label column value should appear in the DOM
    expect(screen.getByText('DSHS')).toBeTruthy();
  });

  it('renders Explain button', () => {
    render(
      <DataTable
        result={fixture}
        subtitle="Top agencies by net spend"
        onExplain={() => {}}
      />
    );
    expect(screen.getByText('Explain ›')).toBeTruthy();
  });

  it('renders empty state message when rows are empty', () => {
    render(
      <DataTable
        result={emptyResult}
        subtitle="No data"
      />
    );
    // The emptyReason message should appear
    expect(screen.getByText(/no vendor match/i)).toBeTruthy();
  });
});
