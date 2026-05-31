/**
 * Tests for the vendor-search API handler core.
 * Uses vendorMapOverride to avoid loading vendors.json from disk.
 * resolveVendor is pure — no DuckDB needed, so this runs in the node pool.
 */
import { describe, it, expect } from 'vitest';
import { vendorSearchCore } from './vendor-search';
import type { VendorMap } from '../src/lib/ai/resolveVendor';

const TEST_VENDOR_MAP: VendorMap = {
  'microsoft-corp': {
    vendorId: 'microsoft-corp',
    display: 'MICROSOFT CORP',
    aliases: ['microsoft', 'msft', 'microsoft corporation'],
  },
  'deloitte-consulting': {
    vendorId: 'deloitte-consulting',
    display: 'DELOITTE CONSULTING LLP',
    aliases: ['deloitte', 'deloitte consulting'],
  },
  'accenture-llp': {
    vendorId: 'accenture-llp',
    display: 'ACCENTURE LLP',
    aliases: ['accenture'],
  },
};

describe('vendorSearchCore', () => {
  it('returns empty matches for empty query', async () => {
    const result = await vendorSearchCore('', TEST_VENDOR_MAP);
    expect(result.matches).toHaveLength(0);
  });

  it('returns empty matches for whitespace-only query', async () => {
    const result = await vendorSearchCore('   ', TEST_VENDOR_MAP);
    expect(result.matches).toHaveLength(0);
  });

  it('auto-resolves an exact match (score ≥ 0.90, margin ≥ 0.15)', async () => {
    const result = await vendorSearchCore('microsoft corp', TEST_VENDOR_MAP);
    // Should auto-resolve to microsoft-corp
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].vendorId).toBe('microsoft-corp');
  });

  it('returns chip matches for ambiguous query', async () => {
    const result = await vendorSearchCore('deloitte accenture', TEST_VENDOR_MAP);
    // Ambiguous — returns chips
    expect(result.matches.length).toBeGreaterThanOrEqual(1);
  });

  it('returns matches for alias lookup', async () => {
    const result = await vendorSearchCore('msft', TEST_VENDOR_MAP);
    expect(result.matches.length).toBeGreaterThanOrEqual(1);
    // Microsoft should be top result
    expect(result.matches[0].vendorId).toBe('microsoft-corp');
  });

  it('returns matches with display name populated', async () => {
    const result = await vendorSearchCore('deloitte', TEST_VENDOR_MAP);
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches[0].display).toBeTruthy();
  });

  it('handles empty vendor map gracefully', async () => {
    const result = await vendorSearchCore('microsoft', {});
    expect(result.matches).toHaveLength(0);
  });
});
