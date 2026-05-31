import { describe, it, expect } from 'vitest';
import { validateSpec } from './validateSpec';
import type { QuerySpec, Dimensions } from '../../../contracts';

const dims: Dimensions = {
  agency: [
    { id: 'DSHS', label: 'Department of Social and Health Services' },
    { id: 'DOT', label: 'Department of Transportation' },
  ],
  category: [
    { id: 'professional-services', label: 'Professional Services' },
    { id: 'it', label: 'IT' },
  ],
  subcategory: [
    { id: 'consulting', label: 'Consulting' },
    { id: 'software-licenses', label: 'Software Licenses' },
  ],
};

const validSpec: QuerySpec = {
  intent: 'rank',
  measure: 'amount',
  agg: 'sum',
  netGross: 'net',
  filters: {},
  groupBy: 'agency',
  sort: { by: 'measure', dir: 'desc' },
  topN: 10,
  chart: 'bar',
};

describe('validateSpec', () => {
  it('accepts a fully valid spec', () => {
    const result = validateSpec(validSpec, dims);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.spec).toEqual(validSpec);
  });

  it('returns unknown_enum error for unknown agency filter', () => {
    const spec: QuerySpec = {
      ...validSpec,
      filters: { agency: ['UNKNOWN_AGENCY'] },
    };
    const result = validateSpec(spec, dims);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unknown_enum');
      expect(result.error.field).toBe('filters.agency');
      expect(result.error.suggestion).toBeDefined();
    }
  });

  it('suggests the closest agency by label distance', () => {
    // "DSHS" is very close to "DSHS" — test with a slight misspell
    const spec: QuerySpec = {
      ...validSpec,
      filters: { agency: ['DSH'] },
    };
    const result = validateSpec(spec, dims);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Should suggest "DSHS" as closest
      expect(result.error.suggestion).toBe('DSHS');
    }
  });

  it('returns unknown_enum for unknown category', () => {
    const spec: QuerySpec = {
      ...validSpec,
      filters: { category: ['unknown-cat'] },
    };
    const result = validateSpec(spec, dims);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unknown_enum');
      expect(result.error.field).toBe('filters.category');
    }
  });

  it('returns unknown_enum for unknown subcategory', () => {
    const spec: QuerySpec = {
      ...validSpec,
      filters: { subcategory: ['unknown-sub'] },
    };
    const result = validateSpec(spec, dims);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unknown_enum');
      expect(result.error.field).toBe('filters.subcategory');
    }
  });

  it('returns semantic error when topN > 50', () => {
    const spec: QuerySpec = { ...validSpec, topN: 51 };
    const result = validateSpec(spec, dims);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('semantic');
      expect(result.error.field).toBe('topN');
    }
  });

  it('returns semantic error when topN is 0 or negative', () => {
    const result = validateSpec({ ...validSpec, topN: 0 }, dims);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('semantic');
  });

  it('returns schema error for missing required field', () => {
    // Cast to any to simulate bad input
    const spec = { ...validSpec } as Record<string, unknown>;
    delete spec['intent'];
    const result = validateSpec(spec as unknown as QuerySpec, dims);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('schema');
  });

  it('returns schema error for invalid agg enum', () => {
    const spec = { ...validSpec, agg: 'bad_agg' as unknown as QuerySpec['agg'] };
    const result = validateSpec(spec, dims);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('schema');
  });

  it('accepts known agency in filters', () => {
    const spec: QuerySpec = { ...validSpec, filters: { agency: ['DSHS'] } };
    const result = validateSpec(spec, dims);
    expect(result.ok).toBe(true);
  });

  it('accepts valid topN = 50', () => {
    const spec: QuerySpec = { ...validSpec, topN: 50 };
    expect(validateSpec(spec, dims).ok).toBe(true);
  });

  it('accepts valid topN = 1', () => {
    const spec: QuerySpec = { ...validSpec, topN: 1 };
    expect(validateSpec(spec, dims).ok).toBe(true);
  });

  it('is pure — does not mutate input', () => {
    const spec: QuerySpec = { ...validSpec, filters: { agency: ['DSHS'] } };
    const copy = JSON.stringify(spec);
    validateSpec(spec, dims);
    expect(JSON.stringify(spec)).toBe(copy);
  });
});
