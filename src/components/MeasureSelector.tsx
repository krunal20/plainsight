/**
 * MeasureSelector — dropdown bound to store.measure.
 * Changing it updates the specs driving the dashboard charts.
 * distinct_count/avg route through /api/query via runQuery since the cube
 * cannot answer them — that is expected behavior.
 */
import { useStore } from '../state/store';
import { tokens } from '../theme/tokens';
import type { AppState } from '../state/storeTypes';

type Measure = AppState['measure'];

const MEASURE_OPTIONS: { value: Measure; label: string; hint?: string }[] = [
  { value: 'sum',            label: 'Total (Sum)' },
  { value: 'avg',            label: 'Average',       hint: 'via SQL' },
  { value: 'share',          label: 'Share (%)' },
  { value: 'yoy_delta',      label: 'YoY Change' },
  { value: 'distinct_count', label: 'Distinct Count', hint: 'via SQL' },
];

export function MeasureSelector() {
  const measure   = useStore(s => s.measure);
  const setMeasure = useStore(s => s.setMeasure);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span
        style={{
          fontFamily: tokens.fontSans,
          fontSize: 12,
          color: tokens.muted,
          fontWeight: 600,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}
      >
        Measure
      </span>
      <select
        aria-label="Measure"
        value={measure}
        onChange={e => setMeasure(e.target.value as Measure)}
        style={{
          fontFamily: tokens.fontSans,
          fontSize: 13,
          padding: '4px 8px',
          border: `1px solid ${tokens.line}`,
          borderRadius: 6,
          background: tokens.card,
          color: tokens.ink,
          cursor: 'pointer',
        }}
      >
        {MEASURE_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}{opt.hint ? ` (${opt.hint})` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
