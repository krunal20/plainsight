import type { QueryResult } from '../../../contracts/index';
import type { ChartProps } from '../../../contracts/index';
import { tokens } from '../../theme/tokens';
import { ChartHeader, EmptyState } from './ChartShell';

// ── Pure option mapper ───────────────────────────────────────────────────────

export interface KpiOptionResult {
  value: number | null;
  label: string;
  empty: boolean;
  emptyReason?: QueryResult['meta']['emptyReason'];
}

export function kpiOption(result: QueryResult): KpiOptionResult {
  if (result.rows.length === 0) {
    return { value: null, label: '', empty: true, emptyReason: result.meta.emptyReason };
  }
  const row = result.rows[0];
  return { value: row.value, label: row.label, empty: false };
}

// ── Component ────────────────────────────────────────────────────────────────

function formatKpi(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }
  return `$${value.toLocaleString()}`;
}

export function Kpi({ result, subtitle, onExplain }: ChartProps) {
  const opt = kpiOption(result);

  return (
    <div style={{ padding: 16 }}>
      <ChartHeader subtitle={subtitle} onExplain={onExplain} />
      {opt.empty ? (
        <EmptyState result={result} />
      ) : (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <div
            style={{
              fontSize: 48,
              fontWeight: 700,
              fontFamily: tokens.fontMono,
              color: tokens.lead,
              lineHeight: 1,
            }}
          >
            {formatKpi(opt.value!)}
          </div>
          {opt.label && (
            <div
              style={{
                marginTop: 8,
                fontSize: 13,
                color: tokens.muted,
                fontFamily: tokens.fontSans,
              }}
            >
              {opt.label}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
