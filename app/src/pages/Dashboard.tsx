/**
 * Dashboard — Overview tab: 4 charts driven by cubeReader + store filters.
 * Charts: composition treemap, top agencies bar, top vendors bar, monthly trend line.
 */
import { useEffect, useState, useCallback } from 'react';
import type { Cube, QuerySpec } from '../../contracts';
import { cubeReader } from '../lib/query/cubeReader';
import { loadCube } from '../lib/loadCube';
import { useStore } from '../state/store';
import { Treemap } from '../components/charts/Treemap';
import { Bar } from '../components/charts/Bar';
import { Line } from '../components/charts/Line';
import { tokens } from '../theme/tokens';

// ── Loading skeleton ──────────────────────────────────────────────────────────

function LoadingCard({ height = 350 }: { height?: number }) {
  return (
    <div
      style={{
        background: tokens.card,
        border: `1px solid ${tokens.line}`,
        borderRadius: 8,
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: tokens.muted,
        fontFamily: tokens.fontSans,
        fontSize: 13,
      }}
    >
      Loading…
    </div>
  );
}

// ── Error card ────────────────────────────────────────────────────────────────

function ErrorCard({ message }: { message: string }) {
  return (
    <div
      style={{
        background: tokens.card,
        border: `1px solid ${tokens.brick}30`,
        borderRadius: 8,
        padding: 24,
        color: tokens.brick,
        fontFamily: tokens.fontSans,
        fontSize: 13,
      }}
    >
      {message}
    </div>
  );
}

// ── Chart card wrapper ────────────────────────────────────────────────────────

function ChartCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: tokens.card,
        border: `1px solid ${tokens.line}`,
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
}

// ── Aggregate top vendors across all agencies ─────────────────────────────────

function buildTopVendorsResult(
  cube: Cube,
  netGross: 'net' | 'gross',
  topN: number,
  filters: QuerySpec['filters']
): import('../../contracts').QueryResult {
  // Filter vendorsByAgency by selected agencies
  const agencyFilter = filters.agency;

  const totals = new Map<string, { name: string; value: number }>();

  for (const [agency, vendors] of Object.entries(cube.vendorsByAgency)) {
    if (agencyFilter?.length && !agencyFilter.includes(agency)) continue;
    for (const v of vendors) {
      const existing = totals.get(v.vendorId);
      const val = netGross === 'gross' ? v.gross : v.net;
      if (existing) {
        existing.value += val;
      } else {
        totals.set(v.vendorId, { name: v.name, value: val });
      }
    }
  }

  let rows = Array.from(totals.values())
    .map(v => ({ label: v.name, value: v.value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, topN);

  const totalNet = cube.totals.net;
  const totalGross = cube.totals.gross;

  const spec: QuerySpec = {
    intent: 'rank',
    measure: 'amount',
    agg: 'sum',
    netGross,
    filters,
    groupBy: 'vendor',
    sort: { by: 'measure', dir: 'desc' },
    topN,
    chart: 'bar',
  };

  return {
    rows,
    columns: [
      { key: 'label', label: 'Vendor', type: 'string' },
      { key: 'value', label: netGross === 'gross' ? 'Gross Spend' : 'Net Spend', type: 'currency' },
    ],
    meta: {
      totalNet,
      totalGross,
      rowCount: rows.length,
      truncated: rows.length === topN,
    },
    spec,
    sql: `-- top vendors aggregated client-side`,
    traceId: `cube-vendors-${netGross}-${topN}`,
  };
}

// ── Monthly trend with FY as group ───────────────────────────────────────────

function buildMonthlyTrendResult(
  cube: Cube,
  netGross: 'net' | 'gross',
  filters: QuerySpec['filters']
): import('../../contracts').QueryResult {
  // Group by month AND fy (multi-series line)
  const grouped = new Map<string, number>(); // key: "YYYY-MM"

  for (const cell of cube.cells) {
    if (filters.agency?.length && !filters.agency.includes(cell.agency)) continue;
    if (filters.category?.length && !filters.category.includes(cell.category)) continue;
    if (filters.subcategory?.length && !filters.subcategory.includes(cell.subcategory)) continue;
    if (filters.fy?.length && !filters.fy.includes(cell.fy)) continue;

    const key = `${cell.fy}-${String(cell.month).padStart(2, '0')}`;
    const val = netGross === 'gross' ? cell.gross : cell.net;
    grouped.set(key, (grouped.get(key) ?? 0) + val);
  }

  // Convert to rows with group field for multi-series support
  const rows: { label: string; value: number; group?: string }[] = [];

  for (const [key, value] of grouped) {
    const [fyStr, monthStr] = key.split('-');
    const fy = fyStr;
    const month = Number(monthStr);
    const monthLabel = new Date(2000, month - 1, 1).toLocaleString('en-US', { month: 'short' });
    rows.push({ label: monthLabel, value, group: `FY${fy.slice(2)}` });
  }

  // Sort by fy then month
  rows.sort((a, b) => {
    const groupCmp = (a.group ?? '').localeCompare(b.group ?? '');
    if (groupCmp !== 0) return groupCmp;
    // Month order: Jan=0, Feb=1, ... — keep natural month ordering
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return MONTHS.indexOf(a.label) - MONTHS.indexOf(b.label);
  });

  const spec: QuerySpec = {
    intent: 'trend',
    measure: 'amount',
    agg: 'sum',
    netGross,
    filters,
    groupBy: 'month',
    chart: 'line',
  };

  return {
    rows,
    columns: [
      { key: 'label', label: 'Month', type: 'string' },
      { key: 'value', label: 'Spend', type: 'currency' },
    ],
    meta: {
      totalNet: cube.totals.net,
      totalGross: cube.totals.gross,
      rowCount: rows.length,
      truncated: false,
    },
    spec,
    sql: `-- monthly trend aggregated client-side`,
    traceId: `cube-trend-${netGross}`,
  };
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export function Dashboard() {
  const [cube, setCube] = useState<Cube | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filters = useStore(s => s.filters);
  const netGross = useStore(s => s.netGross);
  const topN = useStore(s => s.topN);
  const applySelection = useStore(s => s.applySelection);

  useEffect(() => {
    loadCube()
      .then(setCube)
      .catch(err => {
        console.error('[Dashboard] Failed to load cube:', err);
        setError('Failed to load data. Please refresh the page.');
      });
  }, []);

  const handleSelect = useCallback(
    (sel: { dimension: import('../../contracts').Dimension; value: string }) => {
      applySelection(sel);
    },
    [applySelection]
  );

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <ErrorCard message={error} />
      </div>
    );
  }

  if (!cube) {
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          padding: 24,
        }}
      >
        <LoadingCard height={380} />
        <LoadingCard height={380} />
        <LoadingCard height={320} />
        <LoadingCard height={320} />
      </div>
    );
  }

  const baseFilters = { ...filters };

  // 1) Composition treemap — category breakdown
  const treemapSpec: QuerySpec = {
    intent: 'breakdown',
    measure: 'amount',
    agg: 'sum',
    netGross,
    filters: baseFilters,
    groupBy: 'category',
    sort: { by: 'measure', dir: 'desc' },
    topN: 20,
    chart: 'treemap',
  };
  const treemapResult = cubeReader(treemapSpec, cube);

  // 2) Top agencies bar
  const agencySpec: QuerySpec = {
    intent: 'rank',
    measure: 'amount',
    agg: 'sum',
    netGross,
    filters: baseFilters,
    groupBy: 'agency',
    sort: { by: 'measure', dir: 'desc' },
    topN,
    chart: 'bar',
  };
  const agencyResult = cubeReader(agencySpec, cube);

  // 3) Top vendors bar (aggregated client-side)
  const vendorResult = buildTopVendorsResult(cube, netGross, topN, baseFilters);

  // 4) Monthly trend line
  const trendResult = buildMonthlyTrendResult(cube, netGross, baseFilters);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 16,
        padding: 24,
      }}
    >
      <ChartCard>
        <Treemap
          result={treemapResult}
          subtitle="Spend by category — how is the budget composed?"
          onSelect={handleSelect}
        />
      </ChartCard>

      <ChartCard>
        <Bar
          result={agencyResult}
          subtitle={`Top ${topN} agencies by ${netGross} spend`}
          onSelect={handleSelect}
        />
      </ChartCard>

      <ChartCard>
        <Bar
          result={vendorResult}
          subtitle={`Top ${topN} vendors by ${netGross} spend (aggregated across agencies)`}
          onSelect={handleSelect}
        />
      </ChartCard>

      <ChartCard>
        <Line
          result={trendResult}
          subtitle="Monthly spend trend — FY22 vs FY23"
          onSelect={handleSelect}
        />
      </ChartCard>
    </div>
  );
}
