/**
 * MoversView — "What Changed" tab.
 * Uses yoy_delta agg grouped by agency (or category), sorted by delta.
 * Shows ranked risers/fallers as a diverging bar + table.
 */
import { useState, useEffect } from 'react';
import type { Cube, QueryResult } from '../../contracts';
import { runQuery } from '../lib/query/runQuery';
import { tokens } from '../theme/tokens';
import { useStore } from '../state/store';
import type { Dimension } from '../../contracts';

// ── helpers ────────────────────────────────────────────────────────────────────

function fmtDelta(v: number): string {
  const sign = v >= 0 ? '+' : '';
  if (Math.abs(v) >= 1_000_000) return `${sign}$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000)     return `${sign}$${(v / 1_000).toFixed(0)}K`;
  return `${sign}$${Math.round(v).toLocaleString()}`;
}

const GROUPBY_OPTIONS: { value: Dimension; label: string }[] = [
  { value: 'agency',   label: 'Agency' },
  { value: 'category', label: 'Category' },
];

interface MoversViewProps {
  cube: Cube;
}

export function MoversView({ cube }: MoversViewProps) {
  const netGross = useStore(s => s.netGross);
  const filters  = useStore(s => s.filters);

  const [groupBy, setGroupBy] = useState<Dimension>('agency');
  const [result,  setResult]  = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    runQuery(
      {
        intent: 'trend',
        measure: 'amount',
        agg: 'yoy_delta',
        netGross,
        filters,
        groupBy,
        sort: { by: 'measure', dir: 'desc' },
        topN: 20,
        chart: 'bar',
      },
      { cube }
    )
      .then(r => { setResult(r); })
      .catch(e => { setError(e instanceof Error ? e.message : 'Failed to load'); })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cube, groupBy, netGross, JSON.stringify(filters)]);

  const sorted = result ? [...result.rows].sort((a, b) => b.value - a.value) : [];
  const risers = sorted.filter(r => r.value > 0);
  const fallers = sorted.filter(r => r.value < 0).reverse();
  const maxAbs = sorted.length ? Math.max(...sorted.map(r => Math.abs(r.value))) : 1;

  return (
    <div style={{ padding: 24, fontFamily: tokens.fontSans }}>
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <span style={{ fontSize: 13, color: tokens.muted, fontWeight: 600 }}>Group by</span>
        {GROUPBY_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setGroupBy(opt.value)}
            style={{
              padding: '4px 12px',
              borderRadius: 6,
              border: `1px solid ${groupBy === opt.value ? tokens.lead : tokens.line}`,
              background: groupBy === opt.value ? tokens.lead : 'transparent',
              color: groupBy === opt.value ? '#fff' : tokens.muted,
              fontFamily: tokens.fontSans,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            {opt.label}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: tokens.muted }}>FY22 → FY23 delta</span>
      </div>

      {loading && <div style={{ color: tokens.muted, fontSize: 13 }}>Loading…</div>}
      {error   && <div style={{ color: tokens.brick, fontSize: 13 }}>{error}</div>}

      {!loading && !error && result && (
        <>
          {sorted.length === 0 && (
            <div style={{ color: tokens.muted, fontSize: 13 }}>No YoY data available.</div>
          )}

          {sorted.length > 0 && (
            <div
              style={{
                border: `1px solid ${tokens.line}`,
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: tokens.paper }}>
                    <th style={{ ...thStyle, width: '25%' }}>Name</th>
                    <th style={{ ...thStyle, width: '50%' }}>Delta (FY22 → FY23)</th>
                    <th style={{ ...thStyle, width: '25%', textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Risers */}
                  {risers.map((row, i) => (
                    <MoverRow key={`rise-${row.label}`} row={row} maxAbs={maxAbs} index={i} isRiser />
                  ))}
                  {/* Divider */}
                  {risers.length > 0 && fallers.length > 0 && (
                    <tr>
                      <td colSpan={3} style={{ padding: '2px 0', background: tokens.line }} />
                    </tr>
                  )}
                  {/* Fallers */}
                  {fallers.map((row, i) => (
                    <MoverRow key={`fall-${row.label}`} row={row} maxAbs={maxAbs} index={i} isRiser={false} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── MoverRow ──────────────────────────────────────────────────────────────────

interface MoverRowProps {
  row: { label: string; value: number };
  maxAbs: number;
  index: number;
  isRiser: boolean;
}

function MoverRow({ row, maxAbs, index, isRiser }: MoverRowProps) {
  const pct = Math.abs(row.value) / maxAbs;
  const barColor = isRiser ? tokens.sage : tokens.brick;

  return (
    <tr
      data-testid={isRiser ? 'mover-riser' : 'mover-faller'}
      style={{ background: index % 2 === 0 ? tokens.card : tokens.paper }}
    >
      <td style={{ padding: '7px 14px', color: tokens.ink, fontWeight: 500 }}>
        {row.label}
      </td>
      <td style={{ padding: '7px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* For fallers, bar grows from right */}
          {!isRiser && (
            <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
              <div
                style={{
                  width: `${pct * 100}%`,
                  height: 12,
                  background: barColor,
                  borderRadius: 3,
                }}
              />
            </div>
          )}
          {/* For risers, bar grows from left */}
          {isRiser && (
            <div style={{ flex: 1 }}>
              <div
                style={{
                  width: `${pct * 100}%`,
                  height: 12,
                  background: barColor,
                  borderRadius: 3,
                }}
              />
            </div>
          )}
        </div>
      </td>
      <td style={{ padding: '7px 14px', textAlign: 'right', fontWeight: 600, color: barColor, fontFamily: tokens.fontMono, fontSize: 12 }}>
        {fmtDelta(row.value)}
      </td>
    </tr>
  );
}

const thStyle: React.CSSProperties = {
  padding: '8px 14px',
  textAlign: 'left',
  fontWeight: 600,
  color: tokens.muted,
  fontSize: 11,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  borderBottom: `1px solid ${tokens.line}`,
};
