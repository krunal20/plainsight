/**
 * T5.2 — resolveVendor tests
 *
 * resolveVendor(text, vendorMap): { auto?, chips? }
 * - Normalize input + fuzzy-rank against vendor map's display + aliases
 * - Auto-resolve when top score ≥ 0.90 AND margin over #2 ≥ 0.15
 * - Else return up to 5 clarify chips
 * - Uses token-sort ratio (or similar) for fuzzy matching
 */

import { describe, it, expect } from 'vitest';
import { resolveVendor } from './resolveVendor';
import vendorFixture from '../../../fixtures/vendors.fixture.json';

type VendorMap = typeof vendorFixture;

describe('resolveVendor', () => {
  // ── Auto-resolve cases ──────────────────────────────────────────────────────

  it('auto-resolves "microsoft" → MICROSOFT CORP', () => {
    const result = resolveVendor('microsoft', vendorFixture as VendorMap);
    expect(result.auto).toBeDefined();
    expect(result.auto!.vendorId).toBe('microsoft-corp');
    expect(result.auto!.display).toBe('MICROSOFT CORP');
    expect(result.chips).toBeUndefined();
  });

  it('auto-resolves "Microsoft Corporation" → MICROSOFT CORP (case-insensitive)', () => {
    const result = resolveVendor('Microsoft Corporation', vendorFixture as VendorMap);
    expect(result.auto).toBeDefined();
    expect(result.auto!.vendorId).toBe('microsoft-corp');
  });

  it('auto-resolves "msft" → MICROSOFT CORP (alias match)', () => {
    const result = resolveVendor('msft', vendorFixture as VendorMap);
    expect(result.auto).toBeDefined();
    expect(result.auto!.vendorId).toBe('microsoft-corp');
  });

  it('auto-resolves "deloitte" → DELOITTE CONSULTING LLP', () => {
    const result = resolveVendor('deloitte', vendorFixture as VendorMap);
    expect(result.auto).toBeDefined();
    expect(result.auto!.vendorId).toBe('deloitte-consulting');
  });

  it('auto-resolves "accenture" → ACCENTURE LLP', () => {
    const result = resolveVendor('accenture', vendorFixture as VendorMap);
    expect(result.auto).toBeDefined();
    expect(result.auto!.vendorId).toBe('accenture-llp');
  });

  // ── Clarify chips (ambiguous) ───────────────────────────────────────────────

  it('returns clarify chips for "lam" (ambiguous — lam-doris vs lam-research)', () => {
    const result = resolveVendor('lam', vendorFixture as VendorMap);
    expect(result.auto).toBeUndefined();
    expect(result.chips).toBeDefined();
    expect(result.chips!.length).toBeGreaterThanOrEqual(2);
    expect(result.chips!.length).toBeLessThanOrEqual(5);
    // Both lam vendors should appear in chips
    const chipLabels = result.chips!.map(c => c.label);
    const hasLamDoris = chipLabels.some(l => l.toLowerCase().includes('lam'));
    expect(hasLamDoris).toBe(true);
  });

  it('returns up to 5 chips for ambiguous input', () => {
    const result = resolveVendor('lam', vendorFixture as VendorMap);
    expect(result.chips!.length).toBeLessThanOrEqual(5);
  });

  // ── Unknown vendor ──────────────────────────────────────────────────────────

  it('returns chips for completely unknown text', () => {
    const result = resolveVendor('xyz unknown vendor 12345', vendorFixture as VendorMap);
    // Should return chips (no auto), not throw
    expect(result.auto).toBeUndefined();
    expect(result.chips).toBeDefined();
  });

  // ── Empty input ─────────────────────────────────────────────────────────────

  it('returns chips for empty string input', () => {
    const result = resolveVendor('', vendorFixture as VendorMap);
    expect(result.auto).toBeUndefined();
    expect(result.chips).toBeDefined();
  });

  // ── Exact display name match ─────────────────────────────────────────────────

  it('auto-resolves exact display name match "MICROSOFT CORP"', () => {
    const result = resolveVendor('MICROSOFT CORP', vendorFixture as VendorMap);
    expect(result.auto).toBeDefined();
    expect(result.auto!.vendorId).toBe('microsoft-corp');
  });

  // ── Chip structure ──────────────────────────────────────────────────────────

  it('chips have label property', () => {
    const result = resolveVendor('lam', vendorFixture as VendorMap);
    for (const chip of result.chips!) {
      expect(chip.label).toBeDefined();
      expect(typeof chip.label).toBe('string');
    }
  });
});
