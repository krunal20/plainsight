/**
 * EntityProfile — mini-report for a selected agency or vendor.
 * Composes multiple specs:
 *   - Total KPI (scalar)
 *   - Category breakdown (treemap-style table)
 *   - Monthly trend (grouped by fy)
 *   - Top vendors (only for agency entities)
 *
 * Reachable by drilling to a single entity or from the Vendors tab.
 */
import { useState, useEffect } from 'react';
import type { Cube, QueryResult } from '../../../contracts';
import { runQuery } from '../lib/query/runQuery';
import { tokens } from '../theme/tokens';

// ── helpers ────────────────────────────────────────────────────────────────────

function fmt(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000)     return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)         return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toLocaleString()}`;
}

// ── EntityProfile ─────────────────────────────────────────────────────────────

export interface EntityProfileProps {
  entity: { type: 'agency' | 'vendor'; id: string; name?: string };
  cube: Cube;
  netGross?: 'net' | 'gross';
}

interface ProfileData {
  total: QueryResult | null;
  breakdown: QueryResult | null;
  trend: QueryResult | null;
  topVendors: QueryResult | null;
}

export function EntityProfile({ entity, cube, netGross = 'net' }: EntityProfileProps) {
  const [data,    setData]    = useState<ProfileData>({ total: null, breakdown: null, trend: null, topVendors: null });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const baseFilters =
      entity.type === 'agency'
        ? { agency: [entity.id] }
        : { vendorIds: [entity.id] };

    const isAgency = entity.type === 'agency';

    const promises: [Promise<QueryResult>, Promise<QueryResult>, Promise<QueryResult>, Promise<QueryResult> | null] = [
      // 1. Total KPI
      runQuery(
        { intent: 'total', measure: 'amount', agg: 'sum', netGross, filters: baseFilters, chart: 'kpi' },
        { cube }
      ),
      // 2. Category breakdown
      runQuery(
        { intent: 'breakdown', measure: 'amount', agg: 'sum', netGross, filters: baseFilters, groupBy: 'category', sort: { by: 'measure', dir: 'desc' }, topN: 8, chart: 'bar' },
        { cube }
      ),
      // 3. Monthly trend by fy
      runQuery(
        { intent: 'trend', measure: 'amount', agg: 'sum', netGross, filters: baseFilters, groupBy: 'month', chart: 'line' },
        { cube }
      ),
      // 4. Top vendors (only for agency)
      isAgency
        ? runQuery(
            { intent: 'rank', measure: 'amount', agg: 'sum', netGross, filters: baseFilters, groupBy: 'vendor', sort: { by: 'measure', dir: 'desc' }, topN: 5, chart: 'bar' },
            { cube }
          )
        : null,
    ];

    Promise.all(promises)
      .then(([total, breakdown, trend, topVendors]) => {
        setData({ total, breakdown, trend, topVendors });
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity.id, entity.type, netGross]);

  const displayName = entity.name ?? entity.id;

  return (
    <div style={{ padding: 24, fontFamily: tokens.fontSans }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: tokens.muted, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4 }}>
          {entity.type}
        </div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: tokens.ink }}>{displayName}</h2>
      </div>

      {loading && <div style={{ color: tokens.muted, fontSize: 13 }}>Loading profile…</div>}
      {error   && <div style={{ color: tokens.brick, fontSize: 13 }}>{error}</div>}

      {!loading && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Total KPI */}
          {data.total && data.total.rows.length > 0 && (
            <section>
              <SectionTitle>Total Spend ({netGross})</SectionTitle>
              <div style={{ fontSize: 28, fontWeight: 700, color: tokens.lead }}>
                {fmt(data.total.rows[0]?.value ?? 0)}
              </div>
            </section>
          )}

          {/* Category breakdown */}
          {data.breakdown && data.breakdown.rows.length > 0 && (
            <section>
              <SectionTitle>Spend by Category</SectionTitle>
              <SimpleBarChart rows={data.breakdown.rows} />
            </section>
          )}

          {/* Monthly trend */}
          {data.trend && data.trend.rows.length > 0 && (
            <section>
              <SectionTitle>Monthly Trend</SectionTitle>
              <TrendTable rows={data.trend.rows} />
            </section>
          )}

          {/* Top vendors */}
          {data.topVendors && data.topVendors.rows.length > 0 && (
            <section>
              <SectionTitle>Top Vendors</SectionTitle>
              <SimpleBarChart rows={data.topVendors.rows} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}

// ── sub-components ──────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: tokens.muted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
      {children}
    </h3>
  );
}

function SimpleBarChart({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(...rows.map(r => r.value), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map(row => (
        <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 160, fontSize: 12, color: tokens.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {row.label}
          </span>
          <div style={{ flex: 1, height: 14, background: tokens.line, borderRadius: 3, overflow: 'hidden' }}>
            <div
              style={{
                width: `${(row.value / max) * 100}%`,
                height: '100%',
                background: tokens.lead,
                borderRadius: 3,
              }}
            />
          </div>
          <span style={{ width: 80, fontSize: 12, color: tokens.muted, textAlign: 'right', fontFamily: tokens.fontMono }}>
            {fmt(row.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function TrendTable({ rows }: { rows: { label: string; value: number; group?: string }[] }) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {rows.map((row, i) => (
        <div
          key={`${row.group ?? ''}-${row.label}-${i}`}
          style={{
            padding: '4px 8px',
            border: `1px solid ${tokens.line}`,
            borderRadius: 4,
            fontSize: 11,
            color: tokens.ink,
            background: tokens.card,
            fontFamily: tokens.fontMono,
          }}
        >
          {row.group ? `${row.group} ` : ''}{row.label}: {fmt(row.value)}
        </div>
      ))}
    </div>
  );
}
