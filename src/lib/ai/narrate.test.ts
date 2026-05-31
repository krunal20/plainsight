/**
 * T5.6 — narrate tests
 *
 * narrate(result, { llm, traceId, log }): Promise<string>
 * - Calls llm.complete with ONLY result.rows + result.meta (never full cube)
 * - Passes output through numberGuard(text, result)
 * - Returns cleaned text (drops sentences with fabricated numbers)
 * - Test: fakeLLM returning prose with one good + one fabricated number
 *   → assert fabricated sentence is dropped
 */

import { describe, it, expect } from 'vitest';
import { narrate } from './narrate';
import { fakeLLM } from './llm';
import { createLog } from './log';
import type { QueryResult } from '../../../contracts';

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

describe('narrate', () => {
  it('returns grounded narration unchanged (no fabricated numbers)', async () => {
    const llm = fakeLLM([
      { type: 'complete', text: 'DSHS received $2.7M and DOT received $4.46M.' },
    ]);
    const log = createLog();

    const text = await narrate(fixtureResult, { llm, traceId: 'test-n1', log });

    expect(text).toContain('$2.7M');
    expect(text).toContain('$4.46M');
  });

  it('drops sentences with fabricated numbers', async () => {
    const llm = fakeLLM([
      {
        type: 'complete',
        text: 'DSHS received $2.7M in net spend. The state budget was $99.9B overall.',
      },
    ]);
    const log = createLog();

    const text = await narrate(fixtureResult, { llm, traceId: 'test-n2', log });

    expect(text).toContain('$2.7M');
    expect(text).not.toContain('$99.9B');
  });

  it('logs exactly one narrate AIEvent', async () => {
    const llm = fakeLLM([
      { type: 'complete', text: 'DOT accounted for $4.46M.' },
    ]);
    const log = createLog();

    await narrate(fixtureResult, { llm, traceId: 'test-n3', log });

    const events = log.all();
    const narrateEvents = events.filter(e => e.step === 'narrate');
    expect(narrateEvents).toHaveLength(1);
  });

  it('returns empty string when all sentences are fabricated', async () => {
    const llm = fakeLLM([
      { type: 'complete', text: 'The state spent $99.9B. Total was $200.5T.' },
    ]);
    const log = createLog();

    const text = await narrate(fixtureResult, { llm, traceId: 'test-n4', log });

    expect(text.trim()).toBe('');
  });

  it('returns text with no numeric tokens unchanged', async () => {
    const llm = fakeLLM([
      { type: 'complete', text: 'These agencies submitted spending reports.' },
    ]);
    const log = createLog();

    const text = await narrate(fixtureResult, { llm, traceId: 'test-n5', log });

    expect(text).toBe('These agencies submitted spending reports.');
  });

  it('handles empty narration text', async () => {
    const llm = fakeLLM([
      { type: 'complete', text: '' },
    ]);
    const log = createLog();

    const text = await narrate(fixtureResult, { llm, traceId: 'test-n6', log });

    expect(text).toBe('');
  });
});
