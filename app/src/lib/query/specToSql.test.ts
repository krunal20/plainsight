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

// ---------- apostrophe / SQL-injection safety ----------

describe('specToSql – apostrophe escaping', () => {
  it('escapes a single apostrophe in an agency filter value', () => {
    const spec: QuerySpec = {
      ...baseSpec(),
      filters: { agency: ["O'BRIEN"] },
    };
    const sql = specToSql(spec);

    // Must contain the SQL-standard doubled-quote escape
    expect(sql).toContain("'O''BRIEN'");

    // Must NOT contain the broken unescaped form
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
    // No raw unescaped apostrophe inside a quoted literal
    expect(sql).not.toMatch(/vendor_id IN \([^)]*'[A-Z]+'[A-Z]/);
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

// ---------- share + groupBy snapshot test ----------

describe('specToSql – share with groupBy', () => {
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

    // Must select the dimension column
    expect(sql).toContain('category,');

    // Must aggregate the raw numerator
    expect(sql).toContain('SUM(net) AS raw_value');

    // Must include the window-total expression
    expect(sql).toContain('SUM(SUM(net)) OVER ()');

    // Must include the percentage calculation
    expect(sql).toContain('ROUND(SUM(net) * 100.0 / SUM(SUM(net)) OVER ()');

    // Must include GROUP BY
    expect(sql).toContain('GROUP BY category');

    // Must include ORDER BY and LIMIT
    expect(sql).toContain('ORDER BY value DESC');
    expect(sql).toContain('LIMIT 10');
  });

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

    // Filter must be present
    expect(sql).toContain("agency IN ('DSHS')");

    // Window total must still be correct
    expect(sql).toContain('SUM(SUM(net)) OVER ()');

    // GROUP BY must follow WHERE
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
    expect(sql).toContain('SUM(gross)');
    expect(sql).not.toContain('SUM(net)');
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
    expect(sql).toContain('SUM(net) AS value');
    expect(sql).not.toContain('GROUP BY');
  });

  it('generates a grouped rank query', () => {
    const spec: QuerySpec = {
      ...baseSpec(),
      filters: {},
    };
    const sql = specToSql(spec);
    expect(sql).toContain('GROUP BY agency');
    expect(sql).toContain('ORDER BY value DESC');
    expect(sql).toContain('LIMIT 10');
  });

  it('applies fy filter as numeric (no quotes)', () => {
    const spec: QuerySpec = {
      ...baseSpec(),
      filters: { fy: [2022] },
    };
    const sql = specToSql(spec);
    expect(sql).toContain('fy IN (2022)');
    // Numeric values must not be quoted
    expect(sql).not.toContain("fy IN ('2022')");
  });

  it('generates YoY delta query', () => {
    const spec: QuerySpec = {
      ...baseSpec(),
      agg: 'yoy_delta',
      mode: 'abs',
    };
    const sql = specToSql(spec);
    expect(sql).toContain('CASE WHEN fy = 2023');
    expect(sql).toContain('CASE WHEN fy = 2022');
  });
});
