import { describe, it, expect } from 'vitest';
import { buildSpecFromClick } from './buildSpecFromClick';
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

describe('buildSpecFromClick', () => {
  it('adds agency filter when clicking an agency on a category breakdown', () => {
    const categorySpec: QuerySpec = { ...base, groupBy: 'category' };
    const result = buildSpecFromClick(categorySpec, { dimension: 'agency', value: 'DSHS' });
    expect(result.filters.agency).toEqual(['DSHS']);
  });

  it('merges new agency filter with existing category filter', () => {
    const spec: QuerySpec = {
      ...base,
      filters: { category: ['professional-services'] },
      groupBy: 'agency',
    };
    const result = buildSpecFromClick(spec, { dimension: 'agency', value: 'DSHS' });
    expect(result.filters.agency).toEqual(['DSHS']);
    expect(result.filters.category).toEqual(['professional-services']);
  });

  it('adds category filter when clicking a category', () => {
    const result = buildSpecFromClick(base, { dimension: 'category', value: 'IT' });
    expect(result.filters.category).toEqual(['IT']);
  });

  it('adds subcategory filter when clicking a subcategory', () => {
    const result = buildSpecFromClick(base, { dimension: 'subcategory', value: 'Consulting' });
    expect(result.filters.subcategory).toEqual(['Consulting']);
  });

  it('adds vendor filter when clicking a vendor', () => {
    const result = buildSpecFromClick(base, { dimension: 'vendor', value: 'microsoft-corp' });
    expect(result.filters.vendorIds).toEqual(['microsoft-corp']);
  });

  it('does NOT mutate the input spec', () => {
    const spec: QuerySpec = { ...base, filters: { agency: ['DOT'] } };
    const snapshot = JSON.stringify(spec);
    buildSpecFromClick(spec, { dimension: 'category', value: 'IT' });
    expect(JSON.stringify(spec)).toBe(snapshot);
  });

  it('does NOT mutate the input filters object', () => {
    const filters = { agency: ['DOT'] };
    const spec: QuerySpec = { ...base, filters };
    buildSpecFromClick(spec, { dimension: 'agency', value: 'DSHS' });
    // original filters.agency should still be ['DOT']
    expect(filters.agency).toEqual(['DOT']);
  });

  it('overwrites existing agency filter (not append)', () => {
    const spec: QuerySpec = { ...base, filters: { agency: ['DOT'] } };
    const result = buildSpecFromClick(spec, { dimension: 'agency', value: 'DSHS' });
    // Filter set to new single value (drill replaces, not appends)
    expect(result.filters.agency).toEqual(['DSHS']);
  });

  it('preserves topN, sort, and other spec fields', () => {
    const result = buildSpecFromClick(base, { dimension: 'agency', value: 'X' });
    expect(result.topN).toBe(base.topN);
    expect(result.sort).toEqual(base.sort);
    expect(result.agg).toBe(base.agg);
    expect(result.netGross).toBe(base.netGross);
  });

  it('handles clicking fy dimension', () => {
    const result = buildSpecFromClick(base, { dimension: 'fy', value: '2023' });
    expect(result.filters.fy).toEqual([2023]);
  });

  it('handles clicking month dimension', () => {
    const result = buildSpecFromClick(base, { dimension: 'month', value: '6' });
    expect(result.filters.monthRange).toEqual([6, 6]);
  });

  it('preserves existing non-overwritten filters', () => {
    const spec: QuerySpec = {
      ...base,
      filters: { agency: ['DSHS'], fy: [2022] },
    };
    const result = buildSpecFromClick(spec, { dimension: 'category', value: 'IT' });
    expect(result.filters.agency).toEqual(['DSHS']);
    expect(result.filters.fy).toEqual([2022]);
    expect(result.filters.category).toEqual(['IT']);
  });
});
