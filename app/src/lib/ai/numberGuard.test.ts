/**
 * T5.1 — numberGuard tests (TRUST KEYSTONE — write first)
 *
 * numberGuard(text, result): GuardResult
 * - Extracts numeric/currency tokens from narration text
 * - Passes iff each traces to result.rows[].value or result.meta totals
 * - Normalizes formats: $1.2B ≈ 1_200_000_000 within ±1% tolerance
 * - ALLOWS values derivable from rows (percentage/share, or difference of two row values)
 * - IGNORES non-data tokens: years 1900–2100, small ordinals ≤ topN like "top 5", rowCount
 * - Returns GuardResult { ok, cleaned, dropped }
 *   - cleaned: text with sentences containing ungrounded numbers removed
 *   - dropped: list of removed sentences
 */

import { describe, it, expect } from 'vitest';
import { numberGuard } from './numberGuard';
import type { QueryResult } from '../../../contracts';

// Fixture result from result.fixture.json
// rows: [{ label: "DSHS", value: 2700000 }, { label: "DOT", value: 4460000 }]
// meta: { totalNet: 7160000, totalGross: 7470000, rowCount: 2 }
const fixtureResult: QueryResult = {
  rows: [
    { label: 'DSHS', value: 2700000 },
    { label: 'DOT', value: 4460000 },
  ],
  columns: [
    { key: 'label', label: 'Agency', type: 'string' },
    { key: 'value', label: 'Net Spend', type: 'currency' },
  ],
  meta: {
    totalNet: 7160000,
    totalGross: 7470000,
    rowCount: 2,
    truncated: false,
  },
  spec: {
    intent: 'rank',
    measure: 'amount',
    agg: 'sum',
    netGross: 'net',
    filters: {},
    groupBy: 'agency',
    sort: { by: 'measure', dir: 'desc' },
    topN: 10,
    chart: 'bar',
  },
  sql: 'SELECT agency, SUM(net) AS value FROM cube GROUP BY agency ORDER BY value DESC LIMIT 10',
  traceId: 'fixture-001',
};

describe('numberGuard', () => {
  // ── Grounded numbers ────────────────────────────────────────────────────────

  it('passes a sentence with a grounded value from rows ($2.7M)', () => {
    const text = 'Agency DSHS received $2.7M in net spend.';
    const result = numberGuard(text, fixtureResult);
    expect(result.ok).toBe(true);
    expect(result.dropped).toHaveLength(0);
    expect(result.cleaned).toBe(text);
  });

  it('passes a sentence with exact row value ($4.46M = DOT 4460000)', () => {
    const text = 'DOT accounted for $4.46M of total spend.';
    const result = numberGuard(text, fixtureResult);
    expect(result.ok).toBe(true);
    expect(result.dropped).toHaveLength(0);
  });

  it('passes a sentence with the totalNet value ($7.16M)', () => {
    const text = 'The combined net spend was $7.16M.';
    const result = numberGuard(text, fixtureResult);
    expect(result.ok).toBe(true);
    expect(result.dropped).toHaveLength(0);
  });

  it('passes totalGross ($7.47M)', () => {
    const text = 'Gross spend reached $7.47M.';
    const result = numberGuard(text, fixtureResult);
    expect(result.ok).toBe(true);
    expect(result.dropped).toHaveLength(0);
  });

  // ── Fabricated numbers ──────────────────────────────────────────────────────

  it('fails and drops a sentence with a fabricated number ($99.9B)', () => {
    const text = 'The state spent $99.9B on services.';
    const result = numberGuard(text, fixtureResult);
    expect(result.ok).toBe(false);
    expect(result.dropped).toContain(text.trim());
    expect(result.cleaned.trim()).toBe('');
  });

  it('drops the offending sentence but keeps grounded sentences', () => {
    const text =
      'Agency DSHS received $2.7M in net spend. The budget was $99.9B overall.';
    const result = numberGuard(text, fixtureResult);
    expect(result.ok).toBe(false);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0]).toContain('$99.9B');
    expect(result.cleaned).toContain('$2.7M');
    expect(result.cleaned).not.toContain('$99.9B');
  });

  // ── Non-data tokens (must be IGNORED) ──────────────────────────────────────

  it('ignores year tokens (1900–2100) — pure year reference', () => {
    const text = 'In 2023 the agencies filed their reports.';
    const result = numberGuard(text, fixtureResult);
    expect(result.ok).toBe(true);
    expect(result.dropped).toHaveLength(0);
  });

  it('ignores small ordinal "top 5" (≤ topN=10)', () => {
    const text = 'In 2023 the top 5 agencies led spending.';
    const result = numberGuard(text, fixtureResult);
    expect(result.ok).toBe(true);
    expect(result.dropped).toHaveLength(0);
  });

  it('ignores rowCount (2)', () => {
    const text = 'There are 2 agencies in this result.';
    const result = numberGuard(text, fixtureResult);
    expect(result.ok).toBe(true);
    expect(result.dropped).toHaveLength(0);
  });

  it('ignores larger ordinals when topN is large', () => {
    const resultWithLargeTopN: QueryResult = {
      ...fixtureResult,
      spec: { ...fixtureResult.spec, topN: 50 },
    };
    const text = 'The top 20 agencies were reviewed.';
    const result = numberGuard(text, resultWithLargeTopN);
    expect(result.ok).toBe(true);
    expect(result.dropped).toHaveLength(0);
  });

  // ── ±1% rounding tolerance ──────────────────────────────────────────────────

  it('passes "about $2.7M" — exact match (within ±1%)', () => {
    const text = 'About $2.7M was allocated to DSHS.';
    const result = numberGuard(text, fixtureResult);
    expect(result.ok).toBe(true);
    expect(result.dropped).toHaveLength(0);
  });

  it('passes a value within ±1% of a row value (rounding tolerance)', () => {
    // 2700000 ± 1% = 2673000 to 2727000 — use $2.71M = 2710000 which is within tolerance
    const text = 'DSHS received approximately $2.71M.';
    const result = numberGuard(text, fixtureResult);
    expect(result.ok).toBe(true);
    expect(result.dropped).toHaveLength(0);
  });

  it('fails a value just outside ±1% of any row value', () => {
    // 2700000 + 2% = 2754000 → $2.754M → rounded "$2.75M"
    // DOT = 4460000, $2.75M is ~38% off; totalNet = 7160000, $2.75M is ~62% off
    const text = 'The spend was $2.75M.';
    const result = numberGuard(text, fixtureResult);
    expect(result.ok).toBe(false);
    expect(result.dropped).toHaveLength(1);
  });

  // ── Large-format normalization ───────────────────────────────────────────────

  it('normalizes $1.2B → 1_200_000_000 (not in fixture → fails)', () => {
    const text = 'Agency A got $1.2B.';
    const result = numberGuard(text, fixtureResult);
    expect(result.ok).toBe(false);
    expect(result.dropped[0]).toContain('$1.2B');
  });

  it('passes $12.4M when fixture has 12400000', () => {
    const resultWith12_4M: QueryResult = {
      ...fixtureResult,
      rows: [{ label: 'Agency A', value: 12_400_000 }],
      meta: { ...fixtureResult.meta, totalNet: 12_400_000 },
    };
    const text = 'Agency A got $12.4M.';
    const result = numberGuard(text, resultWith12_4M);
    expect(result.ok).toBe(true);
    expect(result.dropped).toHaveLength(0);
  });

  // ── Derivable values (percentage / difference) ───────────────────────────────

  it('allows a percentage/share derived from rows', () => {
    // DSHS / totalNet = 2700000 / 7160000 = ~37.7%
    const text = 'DSHS represents about 37.7% of total spend.';
    const result = numberGuard(text, fixtureResult);
    expect(result.ok).toBe(true);
    expect(result.dropped).toHaveLength(0);
  });

  it('allows a difference of two row values (4460000 - 2700000 = 1760000 → $1.76M)', () => {
    const text = 'DOT exceeded DSHS by $1.76M.';
    const result = numberGuard(text, fixtureResult);
    expect(result.ok).toBe(true);
    expect(result.dropped).toHaveLength(0);
  });

  // ── Edge cases ──────────────────────────────────────────────────────────────

  it('returns ok:true and unchanged text for a text with no numeric tokens', () => {
    const text = 'Agencies submitted their reports on time.';
    const result = numberGuard(text, fixtureResult);
    expect(result.ok).toBe(true);
    expect(result.cleaned).toBe(text);
    expect(result.dropped).toHaveLength(0);
  });

  it('handles empty text', () => {
    const result = numberGuard('', fixtureResult);
    expect(result.ok).toBe(true);
    expect(result.cleaned).toBe('');
    expect(result.dropped).toHaveLength(0);
  });

  it('drops all sentences when all contain fabricated numbers', () => {
    const text = '$50.0B was spent. $75.5T was allocated.';
    const result = numberGuard(text, fixtureResult);
    expect(result.ok).toBe(false);
    expect(result.dropped).toHaveLength(2);
    expect(result.cleaned.trim()).toBe('');
  });
});
