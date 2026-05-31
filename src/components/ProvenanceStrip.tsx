/**
 * ProvenanceStrip — "Source: WA vendor payments · FY2022–23 · ..."
 * Static provenance information about the underlying dataset.
 */
import { tokens } from '../theme/tokens';

export function ProvenanceStrip() {
  return (
    <div
      style={{
        fontFamily: tokens.fontSans,
        fontSize: 12,
        color: tokens.muted,
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px 12px',
        alignItems: 'center',
        padding: '8px 0',
        borderTop: `1px solid ${tokens.line}`,
      }}
      aria-label="Data provenance"
    >
      <span>Source: WA vendor payments</span>
      <span aria-hidden>·</span>
      <span>FY2022–23</span>
      <span aria-hidden>·</span>
      <span>935,853 monthly aggregate rows</span>
      <span aria-hidden>·</span>
      <span>not invoice-level</span>
      <span aria-hidden>·</span>
      <span style={{ color: '#b07030' }}>Unnormalized vendor names (same vendor may appear under multiple spellings)</span>
      <span aria-hidden>·</span>
      <span>Net of refunds (1,083 reversals)</span>
    </div>
  );
}
