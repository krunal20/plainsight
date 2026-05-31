import { describe, it, expect } from 'vitest';
import { encodeSpec, decodeSpec } from './permalink';
import type { QuerySpec } from '../../contracts';

const spec: QuerySpec = {
  intent: 'rank',
  measure: 'amount',
  agg: 'sum',
  netGross: 'net',
  filters: { fy: [2023], agency: ['HCA'] },
  groupBy: 'vendor',
  sort: { by: 'measure', dir: 'desc' },
  topN: 10,
  chart: 'bar',
};

describe('permalink round-trip', () => {
  it('encodeSpec produces a non-empty string', () => {
    expect(encodeSpec(spec)).toBeTruthy();
  });

  it('decodeSpec(encodeSpec(s)) deep-equals s', () => {
    expect(decodeSpec(encodeSpec(spec))).toEqual(spec);
  });

  it('output is URL-safe (no +, /, = characters)', () => {
    const encoded = encodeSpec(spec);
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it('round-trips a spec with all optional fields', () => {
    const full: QuerySpec = {
      ...spec,
      mode: 'abs',
      compare: { dimension: 'fy', a: '2022', b: '2023' },
    };
    expect(decodeSpec(encodeSpec(full))).toEqual(full);
  });

  it('round-trips a minimal spec', () => {
    const minimal: QuerySpec = {
      intent: 'total',
      measure: 'amount',
      agg: 'sum',
      netGross: 'net',
      filters: {},
      chart: 'kpi',
    };
    expect(decodeSpec(encodeSpec(minimal))).toEqual(minimal);
  });
});
