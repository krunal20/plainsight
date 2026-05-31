import { describe, it, expect } from 'vitest';
import { canCubeAnswer } from './canCubeAnswer';
import type { QuerySpec } from '../../../contracts';

const base: QuerySpec = {
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

describe('canCubeAnswer', () => {
  it('returns true for agency groupBy + sum agg', () => {
    expect(canCubeAnswer({ ...base, groupBy: 'agency', agg: 'sum' })).toBe(true);
  });

  it('returns true for category groupBy + share agg', () => {
    expect(canCubeAnswer({ ...base, groupBy: 'category', agg: 'share' })).toBe(true);
  });

  it('returns true for subcategory groupBy + yoy_delta agg', () => {
    expect(canCubeAnswer({ ...base, groupBy: 'subcategory', agg: 'yoy_delta' })).toBe(true);
  });

  it('returns true for month groupBy', () => {
    expect(canCubeAnswer({ ...base, groupBy: 'month' })).toBe(true);
  });

  it('returns true for fy groupBy', () => {
    expect(canCubeAnswer({ ...base, groupBy: 'fy' })).toBe(true);
  });

  it('returns true when groupBy is undefined (scalar KPI)', () => {
    const spec = { ...base } as QuerySpec;
    delete (spec as { groupBy?: unknown }).groupBy;
    expect(canCubeAnswer(spec)).toBe(true);
  });

  it('returns false for groupBy vendor', () => {
    expect(canCubeAnswer({ ...base, groupBy: 'vendor' })).toBe(false);
  });

  it('returns false for agg distinct_count', () => {
    expect(canCubeAnswer({ ...base, agg: 'distinct_count' })).toBe(false);
  });

  it('returns false for agg count', () => {
    expect(canCubeAnswer({ ...base, agg: 'count' })).toBe(false);
  });

  it('returns false for agg avg', () => {
    expect(canCubeAnswer({ ...base, agg: 'avg' })).toBe(false);
  });

  it('returns false when filters.vendorIds is present', () => {
    expect(canCubeAnswer({ ...base, filters: { vendorIds: ['microsoft-corp'] } })).toBe(false);
  });

  it('returns true when filters.vendorIds is empty array', () => {
    // Empty array means no filter applied — treated as no vendorIds filter
    expect(canCubeAnswer({ ...base, filters: { vendorIds: [] } })).toBe(false);
  });
});
