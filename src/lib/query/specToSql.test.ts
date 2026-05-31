import { describe, it, expect } from 'vitest';
import { specToSql } from './specToSql';
import type { QuerySpec } from '../../../contracts';

// ---------- helpers ----------

const baseSpec = (): QuerySpec => ({
  intent: 'rank',
  measure: 'amount',
  agg: 'sum',
  netGross: 'net',
  filters: {},
  groupBy: 'agency',
  sort: { by: 'measure', dir: 'desc' },
  topN: 10,
  chart: 'bar',
});

// ---------- T4.3 Snapshot tests (5 required cases) ----------

describe('specToSql – snapshot: rank/agency/sum/net', () => {
  it('generates correct SQL for rank by agency, sum, net', () => {
    const spec: QuerySpec = baseSpec();
    const sql = specToSql(spec);
    // Snapshot: exact expected output
    expect(sql).toBe(
      'SELECT agency,\n' +
      '  SUM(amount) AS value\n' +
      'FROM facts\n' +
      'GROUP BY agency\n' +
      'ORDER BY value DESC\n' +
      'LIMIT 10'
    );
  });
});

describe('specToSql – snapshot: rank/agency/sum/gross', () => {
  it('generates correct SQL for rank by agency, sum, gross (CASE WHEN amount > 0)', () => {
    const spec: QuerySpec = { ...baseSpec(), netGross: 'gross' };
    const sql = specToSql(spec);
    expect(sql).toBe(
      'SELECT agency,\n' +
      '  SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS value\n' +
      'FROM facts\n' +
      'GROUP BY agency\n' +
      'ORDER BY value DESC\n' +
      'LIMIT 10'
    );
  });
});

describe('specToSql – snapshot: share/category/net', () => {
  it('generates correct window-total SQL for share of net by category', () => {
    const spec: QuerySpec = {
      intent: 'breakdown',
      measure: 'amount',
      agg: 'share',
      netGross: 'net',
      filters: {},
      groupBy: 'category',
      sort: { by: 'measure', dir: 'desc' },
      topN: 10,
      chart: 'donut',
    };
    const sql = specToSql(spec);
    expect(sql).toBe(
      'SELECT category,\n' +
      '  SUM(amount) AS raw_value,\n' +
      '  SUM(SUM(amount)) OVER () AS window_total,\n' +
      '  COALESCE(ROUND(SUM(amount) * 100.0 / NULLIF(SUM(SUM(amount)) OVER (), 0), 4), 0) AS value\n' +
      'FROM facts\n' +
      'GROUP BY category\n' +
      'ORDER BY value DESC\n' +
      'LIMIT 10'
    );
  });
});

describe('specToSql – snapshot: yoy_delta/agency/pct', () => {
  it('generates correct YoY delta (pct mode) SQL', () => {
    const spec: QuerySpec = {
      ...baseSpec(),
      agg: 'yoy_delta',
      mode: 'pct',
    };
    const sql = specToSql(spec);
    const amtExpr = 'amount';
    const fy23 = `SUM(CASE WHEN fy = 2023 THEN ${amtExpr} ELSE 0 END)`;
    const fy22 = `SUM(CASE WHEN fy = 2022 THEN ${amtExpr} ELSE 0 END)`;
    expect(sql).toBe(
      'SELECT agency,\n' +
      `  ROUND((${fy23} - ${fy22}) * 100.0 / NULLIF(${fy22}, 0), 4) AS value\n` +
      'FROM facts\n' +
      'GROUP BY agency\n' +
      'ORDER BY value DESC\n' +
      'LIMIT 10'
    );
  });

  it('generates correct YoY delta (abs mode) SQL', () => {
    const spec: QuerySpec = {
      ...baseSpec(),
      agg: 'yoy_delta',
      mode: 'abs',
    };
    const sql = specToSql(spec);
    const amtExpr = 'amount';
    const fy23 = `SUM(CASE WHEN fy = 2023 THEN ${amtExpr} ELSE 0 END)`;
    const fy22 = `SUM(CASE WHEN fy = 2022 THEN ${amtExpr} ELSE 0 END)`;
    expect(sql).toBe(
      'SELECT agency,\n' +
      `  ${fy23} - ${fy22} AS value\n` +
      'FROM facts\n' +
      'GROUP BY agency\n' +
      'ORDER BY value DESC\n' +
      'LIMIT 10'
    );
  });
});

describe('specToSql – snapshot: distinct_count/agency', () => {
  it('generates COUNT(DISTINCT vendorId) for distinct_count agg', () => {
    const spec: QuerySpec = {
      ...baseSpec(),
      agg: 'distinct_count',
    };
    const sql = specToSql(spec);
    expect(sql).toBe(
      'SELECT agency,\n' +
      '  COUNT(DISTINCT vendorId) AS value\n' +
      'FROM facts\n' +
      'GROUP BY agency\n' +
      'ORDER BY value DESC\n' +
      'LIMIT 10'
    );
  });
});

// ---------- apostrophe / SQL-injection safety ----------

describe('specToSql – apostrophe escaping', () => {
  it('escapes a single apostrophe in an agency filter value', () => {
    const spec: QuerySpec = {
      ...baseSpec(),
      filters: { agency: ["O'BRIEN"] },
    };
    const sql = specToSql(spec);
    expect(sql).toContain("'O''BRIEN'");
    expect(sql).not.toMatch(/'O'BRIEN'/);
  });

  it('escapes apostrophes in vendorId filter values', () => {
    const spec: QuerySpec = {
      ...baseSpec(),
      filters: { vendorIds: ["LEVY'S", "INT'L TECH"] },
    };
    const sql = specToSql(spec);
    expect(sql).toContain("'LEVY''S'");
    expect(sql).toContain("'INT''L TECH'");
  });

  it('escapes apostrophes in category filter values', () => {
    const spec: QuerySpec = {
      ...baseSpec(),
      filters: { category: ["O'Brien's Services"] },
    };
    const sql = specToSql(spec);
    expect(sql).toContain("'O''Brien''s Services'");
  });

  it('escapes apostrophes in subcategory filter values', () => {
    const spec: QuerySpec = {
      ...baseSpec(),
      filters: { subcategory: ["Children's Programs"] },
    };
    const sql = specToSql(spec);
    expect(sql).toContain("'Children''s Programs'");
  });

  it('escapes apostrophes in compare.a and compare.b', () => {
    const spec: QuerySpec = {
      ...baseSpec(),
      agg: 'sum',
      groupBy: 'agency',
      compare: { dimension: 'agency', a: "O'BRIEN", b: "LEVY'S" },
    };
    const sql = specToSql(spec);
    expect(sql).toContain("'O''BRIEN'");
    expect(sql).toContain("'LEVY''S'");
  });

  it('does not corrupt values with no apostrophe', () => {
    const spec: QuerySpec = {
      ...baseSpec(),
      filters: { agency: ['DSHS', 'DOT'] },
    };
    const sql = specToSql(spec);
    expect(sql).toContain("'DSHS'");
    expect(sql).toContain("'DOT'");
  });
});

// ---------- share + groupBy tests ----------

describe('specToSql – share with groupBy', () => {
  it('generates correct window-total SQL for share of net by category with agency filter', () => {
    const spec: QuerySpec = {
      intent: 'breakdown',
      measure: 'amount',
      agg: 'share',
      netGross: 'net',
      filters: { agency: ['DSHS'] },
      groupBy: 'category',
      sort: { by: 'measure', dir: 'desc' },
      topN: 5,
      chart: 'donut',
    };
    const sql = specToSql(spec);
    expect(sql).toContain("agency IN ('DSHS')");
    expect(sql).toContain('SUM(SUM(amount)) OVER ()');
    const whereIdx = sql.indexOf('WHERE');
    const groupByIdx = sql.indexOf('GROUP BY');
    expect(whereIdx).toBeGreaterThan(-1);
    expect(groupByIdx).toBeGreaterThan(whereIdx);
  });

  it('generates share of gross (not net) when netGross=gross', () => {
    const spec: QuerySpec = {
      intent: 'breakdown',
      measure: 'amount',
      agg: 'share',
      netGross: 'gross',
      filters: {},
      groupBy: 'category',
      chart: 'donut',
    };
    const sql = specToSql(spec);
    expect(sql).toContain('CASE WHEN amount > 0 THEN amount ELSE 0 END');
    expect(sql).not.toContain('SUM(amount) AS raw_value');
  });
});

// ---------- basic SQL generation smoke tests ----------

describe('specToSql – basic SQL generation', () => {
  it('generates a scalar KPI (no groupBy)', () => {
    const spec: QuerySpec = {
      intent: 'total',
      measure: 'amount',
      agg: 'sum',
      netGross: 'net',
      filters: {},
      chart: 'kpi',
    };
    const sql = specToSql(spec);
    expect(sql).toContain('SUM(amount) AS value');
    expect(sql).not.toContain('GROUP BY');
  });

  it('generates a grouped rank query', () => {
    const sql = specToSql(baseSpec());
    expect(sql).toContain('GROUP BY agency');
    expect(sql).toContain('ORDER BY value DESC');
    expect(sql).toContain('LIMIT 10');
  });

  it('applies fy filter as numeric (no quotes)', () => {
    const spec: QuerySpec = { ...baseSpec(), filters: { fy: [2022] } };
    const sql = specToSql(spec);
    expect(sql).toContain('fy IN (2022)');
    expect(sql).not.toContain("fy IN ('2022')");
  });

  it('generates avg agg SQL', () => {
    const spec: QuerySpec = { ...baseSpec(), agg: 'avg' };
    const sql = specToSql(spec);
    expect(sql).toContain('AVG(amount)');
  });

  it('generates count agg SQL', () => {
    const spec: QuerySpec = { ...baseSpec(), agg: 'count' };
    const sql = specToSql(spec);
    expect(sql).toContain('COUNT(*)');
  });

  it('generates month filter as BETWEEN', () => {
    const spec: QuerySpec = { ...baseSpec(), filters: { monthRange: [3, 9] } };
    const sql = specToSql(spec);
    expect(sql).toContain('month BETWEEN 3 AND 9');
  });

  it('generates vendorId filter correctly', () => {
    const spec: QuerySpec = { ...baseSpec(), filters: { vendorIds: ['microsoft-corp'] } };
    const sql = specToSql(spec);
    expect(sql).toContain("vendorId IN ('microsoft-corp')");
  });

  it('sorts by label ascending', () => {
    const spec: QuerySpec = { ...baseSpec(), sort: { by: 'label', dir: 'asc' } };
    const sql = specToSql(spec);
    expect(sql).toContain('ORDER BY agency ASC');
  });
});
