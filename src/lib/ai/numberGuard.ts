/**
 * T5.1 — numberGuard(text, result): GuardResult
 *
 * Validates that every numeric/currency token in narration text traces back to
 * result.rows[].value or result.meta totals. This is the AI "trust keystone":
 * it ensures narration never emits a number the engine didn't compute.
 *
 * Rules:
 * 1. Normalize currency/number formats ($1.2B → 1_200_000_000)
 * 2. Pass if within ±1% of any row value or meta total
 * 3. ALLOW derivable values (percentage/share, or difference of two rows)
 * 4. IGNORE: years 1900–2100, small ordinals ≤ topN, rowCount
 * 5. Return { ok, cleaned, dropped } — cleaned drops sentences with ungrounded numbers
 */

import type { QueryResult, GuardResult } from '../../../contracts';

// ---------------------------------------------------------------------------
// Suffix multipliers for currency/number format normalization
// ---------------------------------------------------------------------------
const SUFFIX_MAP: Record<string, number> = {
  k: 1_000,
  K: 1_000,
  m: 1_000_000,
  M: 1_000_000,
  b: 1_000_000_000,
  B: 1_000_000_000,
  t: 1_000_000_000_000,
  T: 1_000_000_000_000,
};

/**
 * Parse a numeric token (with optional $, comma separators, suffix) into a float.
 * Returns null if not parseable.
 *
 * Supported formats: $1.2B, 1,234,567, 42%, $7.16M, 3.5K
 */
function parseNumericToken(token: string): number | null {
  // Strip leading $
  let s = token.replace(/^\$/, '');
  // Strip trailing %
  const isPct = s.endsWith('%');
  if (isPct) s = s.slice(0, -1);
  // Extract suffix
  const lastChar = s[s.length - 1];
  const multiplier = lastChar && SUFFIX_MAP[lastChar] !== undefined ? SUFFIX_MAP[lastChar] : 1;
  if (multiplier !== 1) s = s.slice(0, -1);
  // Remove commas
  s = s.replace(/,/g, '');
  const num = parseFloat(s);
  if (isNaN(num)) return null;
  if (isPct) return num; // Return percentage as-is (e.g. 37.7)
  return num * multiplier;
}

// Regex to find numeric tokens in text.
// Matches: $1.2B, $7.16M, $2.7M, 1,234,567, 37.7%, 42, "top 5", 2023, etc.
// We'll split by sentence then scan for numeric-looking tokens.
const CURRENCY_NUMBER_RE =
  /\$[\d,]+(?:\.\d+)?[kKmMbBtT]?|\$[\d,]+|\b[\d,]+(?:\.\d+)?[kKmMbBtT]\b|\b[\d,]+(?:\.\d+)?%|\b\d[\d,]*(?:\.\d+)?\b/g;

/**
 * Split text into sentences. Simple sentence splitter using ". ", "! ", "? ".
 */
function splitSentences(text: string): string[] {
  if (!text.trim()) return [];
  // Split on sentence-ending punctuation followed by space or end of string
  const parts = text.split(/(?<=[.!?])\s+/);
  return parts.filter(s => s.trim().length > 0);
}

/**
 * Check whether a numeric value is "ignored" (non-data token).
 * Ignored: years 1900-2100, small ordinals ≤ topN, rowCount
 */
function isIgnored(value: number, result: QueryResult): boolean {
  // Year range 1900–2100
  if (Number.isInteger(value) && value >= 1900 && value <= 2100) return true;

  // rowCount
  if (value === result.meta.rowCount) return true;

  // Small ordinals ≤ topN (e.g. "top 5" when topN=10)
  const topN = result.spec?.topN ?? 10;
  if (Number.isInteger(value) && value >= 1 && value <= topN) return true;

  return false;
}

/**
 * Check if a value is grounded: within ±1% of any row value or meta total.
 */
function isGrounded(value: number, result: QueryResult): boolean {
  const candidates = [
    ...result.rows.map(r => r.value),
    result.meta.totalNet,
    result.meta.totalGross,
  ];

  for (const candidate of candidates) {
    if (candidate === 0 && value === 0) return true;
    if (candidate !== 0 && Math.abs(value - candidate) / Math.abs(candidate) <= 0.01) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a value is derivable from rows:
 * 1. Percentage/share: value ≈ (row.value / totalNet) * 100 for any row, within ±2%
 * 2. Difference of two row values, within ±1%
 */
function isDerivable(value: number, result: QueryResult): boolean {
  const rows = result.rows;
  const totalNet = result.meta.totalNet;

  // Check percentage/share derivation
  if (totalNet > 0) {
    for (const row of rows) {
      const pct = (row.value / totalNet) * 100;
      if (Math.abs(value - pct) / Math.max(Math.abs(pct), 0.001) <= 0.02) return true;
    }
  }

  // Check difference of two row values
  for (let i = 0; i < rows.length; i++) {
    for (let j = 0; j < rows.length; j++) {
      if (i === j) continue;
      const diff = Math.abs(rows[i].value - rows[j].value);
      if (diff === 0 && value === 0) return true;
      if (diff !== 0 && Math.abs(value - diff) / diff <= 0.01) return true;
    }
  }

  return false;
}

/**
 * numberGuard — validate that all numeric tokens in narration trace to result data.
 */
export function numberGuard(text: string, result: QueryResult): GuardResult {
  if (!text.trim()) {
    return { ok: true, cleaned: text, dropped: [] };
  }

  const sentences = splitSentences(text);
  const kept: string[] = [];
  const dropped: string[] = [];

  for (const sentence of sentences) {
    const tokens = sentence.match(CURRENCY_NUMBER_RE) ?? [];
    let sentenceOk = true;

    for (const token of tokens) {
      const value = parseNumericToken(token);
      if (value === null) continue;

      // Check if it's a percentage value (from token ending with %)
      const isPct = token.endsWith('%');

      // Non-data tokens: ignore years, ordinals, rowCount
      if (!isPct && isIgnored(value, result)) continue;

      // Percentage values: check derivability first, then grounded check
      if (isPct) {
        if (isDerivable(value, result)) continue;
        // Also check if the percentage itself matches a row value directly
        if (isGrounded(value, result)) continue;
        sentenceOk = false;
        break;
      }

      // Regular numeric value: must be grounded or derivable
      if (isGrounded(value, result)) continue;
      if (isDerivable(value, result)) continue;

      // Ungrounded number found
      sentenceOk = false;
      break;
    }

    if (sentenceOk) {
      kept.push(sentence);
    } else {
      dropped.push(sentence);
    }
  }

  return {
    ok: dropped.length === 0,
    cleaned: kept.join(' '),
    dropped,
  };
}
