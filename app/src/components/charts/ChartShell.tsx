/**
 * Shared shell: header (subtitle + Explain button) + empty-state renderer.
 */
import type { QueryResult } from '../../../contracts/index';

const EMPTY_REASON_LABELS: Record<NonNullable<QueryResult['meta']['emptyReason']>, string> = {
  out_of_range: 'No matching rows — out of FY range',
  no_match: 'No matching rows — no vendor match',
  filtered_out: 'No matching rows — filtered out',
};

interface ChartHeaderProps {
  subtitle: string;
  onExplain?: () => void;
}

export function ChartHeader({ subtitle, onExplain }: ChartHeaderProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
      <span
        style={{
          flex: 1,
          fontSize: 13,
          color: '#8c887f', // tokens.muted — inline to avoid theme import in tests
          fontFamily: "'Barlow', system-ui, sans-serif",
          lineHeight: 1.4,
        }}
      >
        {subtitle}
      </span>
      {onExplain && (
        <button
          onClick={onExplain}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 12,
            color: '#ef6a1e',
            fontFamily: "'Barlow', system-ui, sans-serif",
            padding: '2px 0',
            whiteSpace: 'nowrap',
          }}
        >
          Explain ›
        </button>
      )}
    </div>
  );
}

interface EmptyStateProps {
  result: QueryResult;
}

export function EmptyState({ result }: EmptyStateProps) {
  const reason = result.meta.emptyReason;
  const message = reason
    ? EMPTY_REASON_LABELS[reason]
    : 'No data available';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        minHeight: 80,
        color: '#8c887f',
        fontFamily: "'Barlow', system-ui, sans-serif",
        fontSize: 13,
        fontStyle: 'italic',
      }}
    >
      {message}
    </div>
  );
}
