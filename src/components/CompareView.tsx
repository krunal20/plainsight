/**
 * CompareView — Compare tab.
 * Pick two scopes (two agencies, or FY22 vs FY23) and render
 * paired KPIs + mirrored bars + a delta column.
 * Uses two runQuery calls with separate filter sets.
 */
import { useState, useEffect, useCallback } from 'react';
import type { Cube, QueryResult, QuerySpec } from '../../../contracts';
import { runQuery } from '../lib/query/runQuery';
import { tokens } from '../theme/tokens';
import { useStore } from '../state/store';

// ── helpers ────────────────────────────────────────────────────────────────────

function fmt(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toLocaleString()}`;
}

function pctDelta(a: number, b: number): string {
  if (a === 0) return 'N/A';
  const d = ((b - a) / Math.abs(a)) * 100;
  return (d >= 0 ? '+' : '') + d.toFixed(1) + '%';
}

// ── CompareView ────────────────────────────────────────────────────────────────

interface CompareViewProps {
  cube: Cube;
}

type DimOption = 'fy' | 'agency' | 'category';

const DIM_OPTIONS: { value: DimOption; label: string }[] = [
  { value: 'fy',       label: 'Fiscal Year' },
  { value: 'agency',   label: 'Agency' },
  { value: 'category', label: 'Category' },
];

export function CompareView({ cube }: CompareViewProps) {
  const netGross = useStore(s => s.netGross);
  const topN     = useStore(s => s.topN);

  const [dim,     setDim]     = useState<DimOption>('fy');
  const [valueA,  setValueA]  = useState('2022');
  const [valueB,  setValueB]  = useState('2023');
  const [resultA, setResultA] = useState<QueryResult | null>(null);
  const [resultB, setResultB] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const presets: Record<DimOption, { a: string; b: string }> = {
    fy:       { a: '2022', b: '2023' },
    agency:   { a: 'WSDOT', b: 'DOH' },
    category: { a: 'IT', b: 'Health' },
  };

  function handleDimChange(newDim: DimOption) {
    setDim(newDim);
    setValueA(presets[newDim].a);
    setValueB(presets[newDim].b);
  }

  const runCompare = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const makeSpec = (val: string): QuerySpec => ({
        intent: 'breakdown',
        measure: 'amount',
        agg: 'sum',
        netGross,
        filters: {
          ...(dim === 'fy'       ? { fy: [Number(val) as 2022 | 2023] } : {}),
          ...(dim === 'agency'   ? { agency: [val] }   : {}),
          ...(dim === 'category' ? { category: [val] } : {}),
        },
        groupBy: dim === 'fy' ? 'agency' : 'category',
        sort: { by: 'measure', dir: 'desc' },
        topN,
        chart: 'bar',
      });

      const [rA, rB] = await Promise.all([
        runQuery(makeSpec(valueA), { cube }),
        runQuery(makeSpec(valueB), { cube }),
      ]);
      setResultA(rA);
      setResultB(rB);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Compare failed');
    } finally {
      setLoading(false);
    }
  }, [cube, dim, valueA, valueB, netGross, topN]);

  useEffect(() => {
    runCompare();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derive merged rows for delta table ────────────────────────────────────
  const mergedRows = (() => {
    if (!resultA || !resultB) return [];
    const mapA = new Map(resultA.rows.map(r => [r.label, r.value]));
    const mapB = new Map(resultB.rows.map(r => [r.label, r.value]));
    const labels = Array.from(new Set([...mapA.keys(), ...mapB.keys()])).sort();
    return labels.map(label => ({
      label,
      a: mapA.get(label) ?? 0,
      b: mapB.get(label) ?? 0,
    }));
  })();

  const totalA = resultA?.meta.totalNet ?? 0;
  const totalB = resultB?.meta.totalNet ?? 0;

  return (
    <div style={{ padding: 24, fontFamily: tokens.fontSans }}>
      {/* Controls */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <span style={{ color: tokens.muted }}>Compare by</span>
          <select
            aria-label="Compare dimension"
            value={dim}
            onChange={e => handleDimChange(e.target.value as DimOption)}
            style={selectStyle}
          >
            {DIM_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <span style={{ color: tokens.muted, background: `${tokens.lead}20`, padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>A</span>
          <input
            value={valueA}
            onChange={e => setValueA(e.target.value)}
            style={{ ...selectStyle, width: 110 }}
            aria-label="Scope A"
          />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <span style={{ color: tokens.muted, background: `${tokens.sage}20`, padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>B</span>
          <input
            value={valueB}
            onChange={e => setValueB(e.target.value)}
            style={{ ...selectStyle, width: 110 }}
            aria-label="Scope B"
          />
        </label>

        <button
          onClick={runCompare}
          disabled={loading}
          style={{
            padding: '6px 16px',
            background: tokens.lead,
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontFamily: tokens.fontSans,
            fontSize: 13,
            fontWeight: 600,
            cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? 'Loading…' : 'Compare'}
        </button>
      </div>

      {error && (
        <div style={{ color: tokens.brick, fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* KPI totals */}
      {resultA && resultB && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
          <KpiCard label={`Scope A: ${valueA}`} value={fmt(totalA)} color={tokens.lead} />
          <KpiCard label={`Scope B: ${valueB}`} value={fmt(totalB)} color={tokens.sage} />
          <KpiCard label="Delta (B vs A)" value={pctDelta(totalA, totalB)} color={totalB >= totalA ? tokens.sage : tokens.brick} />
        </div>
      )}

      {/* Delta table */}
      {mergedRows.length > 0 && (
        <div
          style={{
            border: `1px solid ${tokens.line}`,
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: tokens.fontSans, fontSize: 13 }}>
            <thead>
              <tr style={{ background: tokens.paper }}>
                <th style={thStyle}>Label</th>
                <th style={{ ...thStyle, color: tokens.lead }}>A: {valueA}</th>
                <th style={{ ...thStyle, color: tokens.sage }}>B: {valueB}</th>
                <th style={thStyle}>Delta</th>
              </tr>
            </thead>
            <tbody>
              {mergedRows.map((row, i) => (
                <tr
                  key={row.label}
                  style={{ background: i % 2 === 0 ? tokens.card : tokens.paper }}
                >
                  <td style={tdStyle}>{row.label}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: tokens.lead }}>{fmt(row.a)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: tokens.sage }}>{fmt(row.b)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: row.b >= row.a ? tokens.sage : tokens.brick }}>
                    {pctDelta(row.a, row.b)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── sub-components ──────────────────────────────────────────────────────────────

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      data-testid="compare-kpi"
      style={{
        border: `1px solid ${tokens.line}`,
        borderRadius: 8,
        padding: '16px 20px',
        background: tokens.card,
      }}
    >
      <div style={{ fontSize: 11, color: tokens.muted, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  fontFamily: 'inherit',
  fontSize: 13,
  padding: '4px 8px',
  border: `1px solid ${tokens.line}`,
  borderRadius: 6,
  background: tokens.card,
  color: tokens.ink,
};

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

const tdStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderBottom: `1px solid ${tokens.line}`,
  color: tokens.ink,
};
