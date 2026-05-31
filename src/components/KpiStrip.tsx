/**
 * KpiStrip — row of KPI tiles computed from cube + store filters.
 * Uses cubeReader(spec, cube) for each metric.
 */
import type { Cube, QuerySpec } from '../../contracts';
import { cubeReader } from '../lib/query/cubeReader';
import { tokens } from '../theme/tokens';
import { useStore } from '../state/store';

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtCurrency(v: number): string {
  if (Math.abs(v) >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(v) >= 1_000_000)     return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000)         return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toLocaleString()}`;
}

function fmtPct(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}

function fmtCount(v: number): string {
  return v.toLocaleString();
}

// ── Tile ──────────────────────────────────────────────────────────────────────

interface TileProps {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}

function Tile({ label, value, sub, accent = false }: TileProps) {
  return (
    <div
      data-testid="kpi-tile"
      style={{
        flex: 1,
        minWidth: 120,
        padding: '12px 16px',
        background: tokens.card,
        border: `1px solid ${tokens.line}`,
        borderRadius: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <span
        style={{
          fontFamily: tokens.fontSans,
          fontSize: 11,
          fontWeight: 600,
          color: tokens.muted,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: tokens.fontMono,
          fontSize: 22,
          fontWeight: 700,
          color: accent ? tokens.lead : tokens.ink,
          lineHeight: 1,
          letterSpacing: '-0.02em',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
      {sub && (
        <span
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 11,
            color: tokens.muted,
          }}
        >
          {sub}
        </span>
      )}
    </div>
  );
}

// ── KpiStrip ─────────────────────────────────────────────────────────────────

interface KpiStripProps {
  cube: Cube;
}

export function KpiStrip({ cube }: KpiStripProps) {
  const filters = useStore(s => s.filters);
  const netGross = useStore(s => s.netGross);

  const baseFilters = { ...filters };

  // 1) Total net spend
  const totalSpec: QuerySpec = {
    intent: 'total',
    measure: 'amount',
    agg: 'sum',
    netGross,
    filters: baseFilters,
    chart: 'kpi',
  };
  const totalResult = cubeReader(totalSpec, cube);
  const totalValue = netGross === 'gross' ? totalResult.meta.totalGross : totalResult.meta.totalNet;

  // 2) YoY % (FY22→FY23)
  const fy22Spec: QuerySpec = {
    intent: 'total',
    measure: 'amount',
    agg: 'sum',
    netGross,
    filters: { ...baseFilters, fy: [2022] },
    chart: 'kpi',
  };
  const fy23Spec: QuerySpec = {
    intent: 'total',
    measure: 'amount',
    agg: 'sum',
    netGross,
    filters: { ...baseFilters, fy: [2023] },
    chart: 'kpi',
  };
  const fy22Result = cubeReader(fy22Spec, cube);
  const fy23Result = cubeReader(fy23Spec, cube);
  const fy22Total = fy22Result.meta[netGross === 'gross' ? 'totalGross' : 'totalNet'];
  const fy23Total = fy23Result.meta[netGross === 'gross' ? 'totalGross' : 'totalNet'];
  const yoyPct = fy22Total > 0 ? ((fy23Total - fy22Total) / fy22Total) * 100 : 0;

  // 3) # agencies
  const agencySpec: QuerySpec = {
    intent: 'rank',
    measure: 'amount',
    agg: 'sum',
    netGross,
    filters: baseFilters,
    groupBy: 'agency',
    topN: 50,
    chart: 'bar',
  };
  const agencyResult = cubeReader(agencySpec, cube);
  const agencyCount = agencyResult.rows.length;

  // 4) # unique categories (proxy for spend breadth)
  const catSpec: QuerySpec = {
    intent: 'breakdown',
    measure: 'amount',
    agg: 'sum',
    netGross,
    filters: baseFilters,
    groupBy: 'category',
    topN: 50,
    chart: 'treemap',
  };
  const catResult = cubeReader(catSpec, cube);
  const catCount = catResult.rows.length;

  // 5) Top-5 agency share — share of top 5 agencies in total
  const top5Spec: QuerySpec = {
    intent: 'rank',
    measure: 'amount',
    agg: 'sum',
    netGross,
    filters: baseFilters,
    groupBy: 'agency',
    sort: { by: 'measure', dir: 'desc' },
    topN: 5,
    chart: 'bar',
  };
  const top5Result = cubeReader(top5Spec, cube);
  const top5Sum = top5Result.rows.reduce((s, r) => s + r.value, 0);
  const top5Share = totalValue > 0 ? (top5Sum / totalValue) * 100 : 0;

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        padding: '12px 24px',
        background: tokens.paper,
        borderBottom: `1px solid ${tokens.line}`,
        overflowX: 'auto',
      }}
    >
      <Tile
        label={`Total ${netGross === 'gross' ? 'Gross' : 'Net'} Spend`}
        value={fmtCurrency(totalValue)}
        accent
      />
      <Tile
        label="FY22→FY23 YoY"
        value={fy22Total > 0 ? fmtPct(yoyPct) : '—'}
        sub={fy22Total > 0 ? `${fmtCurrency(fy22Total)} → ${fmtCurrency(fy23Total)}` : undefined}
      />
      <Tile
        label="Agencies"
        value={fmtCount(agencyCount)}
        sub="in selection"
      />
      <Tile
        label="Categories"
        value={fmtCount(catCount)}
        sub="spend categories"
      />
      <Tile
        label="Top-5 Agency Share"
        value={`${top5Share.toFixed(1)}%`}
        sub="of total spend"
      />
    </div>
  );
}
