/**
 * LimitsPanel — "What this data can't tell you" static disclaimer panel.
 * Content is derived from the nature of the WA vendor payments dataset.
 */
import { tokens } from '../theme/tokens';

const LIMITS = [
  'No invoice or transaction detail — only monthly aggregate totals per vendor/agency.',
  'No geography or per-capita breakdown — payments are not linked to recipient locations.',
  'No budget-vs-actual comparison — only actual payments are recorded.',
  'No vendor type or purpose — the dataset does not classify vendors by industry or service type.',
  'No causal "why" — patterns reflect what was paid, not why spending changed.',
  'No credible forecast — only 2 fiscal years of data (FY2022–FY2023) are available.',
] as const;

export function LimitsPanel() {
  return (
    <div
      style={{
        border: `1px solid ${tokens.line}`,
        borderRadius: 6,
        background: '#faf9f6',
        padding: '12px 16px',
        fontFamily: tokens.fontSans,
        fontSize: 13,
      }}
    >
      <div
        style={{
          fontWeight: 600,
          color: tokens.ink,
          marginBottom: 8,
          fontSize: 13,
        }}
      >
        What this data can't tell you
      </div>
      <ul
        style={{
          margin: 0,
          paddingLeft: 18,
          color: tokens.muted,
          lineHeight: 1.6,
        }}
        aria-label="Data limitations"
      >
        {LIMITS.map((limit, i) => (
          <li key={i}>{limit}</li>
        ))}
      </ul>
    </div>
  );
}
