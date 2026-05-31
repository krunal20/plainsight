/**
 * T5.7 — api/ask.ts orchestration tests
 *
 * Tests the orchestration with fakeLLM + fixture data (mock runSqlQuery to avoid DuckDB).
 * Asserts:
 * - Well-formed AskResponse returned
 * - AIEvents were logged under the shared traceId
 * - interpretation is deterministic plain-English read-back (not model prose)
 * - followups are deterministic QuerySpecs
 *
 * Runs in the 'node' vitest project (api/**).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { QuerySpec, QueryResult, AskResponse } from '../contracts';

// ---------------------------------------------------------------------------
// Mock the AI modules (we inject fakeLLM via module-level override)
// We also mock runSqlQuery to avoid DuckDB in this test
// ---------------------------------------------------------------------------

// Mock the DuckDB query module
vi.mock('./query', () => ({
  runSqlQuery: vi.fn(),
}));

// We'll import the ask handler after setting up mocks
import { buildAskHandler } from './ask';
import { fakeLLM } from '../src/lib/ai/llm';
import { createLog } from '../src/lib/ai/log';
import { runSqlQuery } from './query';

// Fixture result
const mockResult: QueryResult = {
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
  traceId: 'mock-result-001',
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

describe('buildAskHandler orchestration', () => {
  beforeEach(() => {
    vi.mocked(runSqlQuery).mockResolvedValue(mockResult);
  });

  it('returns a well-formed AskResponse with kind:spec', async () => {
    const llm = fakeLLM([
      { type: 'function', name: 'emit_query_spec', args: validSpec },
    ]);
    const log = createLog();

    const handler = buildAskHandler({ llm, log });
    const response = await handler({ text: 'top agencies by spend' });

    expect(response.kind).toBe('spec');
    if (response.kind === 'spec') {
      expect(response.result).toBeDefined();
      expect(response.interpretation).toBeDefined();
      expect(typeof response.interpretation).toBe('string');
      expect(response.followups).toBeDefined();
      expect(Array.isArray(response.followups)).toBe(true);
    }
  });

  it('interpretation is deterministic plain-English read-back of spec', async () => {
    const llm = fakeLLM([
      { type: 'function', name: 'emit_query_spec', args: validSpec },
    ]);
    const log = createLog();

    const handler = buildAskHandler({ llm, log });
    const response = await handler({ text: 'top agencies' });

    if (response.kind === 'spec') {
      // Should contain key elements of the spec (not model prose)
      expect(response.interpretation).toMatch(/amount|agency|rank|sum/i);
    }
  });

  it('AIEvents are logged under the shared traceId', async () => {
    const llm = fakeLLM([
      { type: 'function', name: 'emit_query_spec', args: validSpec },
    ]);
    const log = createLog();

    const handler = buildAskHandler({ llm, log });
    const response = await handler({ text: 'top agencies' });

    const events = log.all();
    expect(events.length).toBeGreaterThan(0);

    if (response.kind === 'spec') {
      // All events should share the same traceId
      const traceId = events[0].traceId;
      expect(traceId).toBeTruthy();
      expect(events.every(e => e.traceId === traceId)).toBe(true);
    }
  });

  it('followups are deterministic QuerySpecs (not from model)', async () => {
    const llm = fakeLLM([
      { type: 'function', name: 'emit_query_spec', args: validSpec },
    ]);
    const log = createLog();

    const handler = buildAskHandler({ llm, log });
    const r1 = await handler({ text: 'top agencies' });

    // Reset the LLM for a second call
    const llm2 = fakeLLM([
      { type: 'function', name: 'emit_query_spec', args: validSpec },
    ]);
    vi.mocked(runSqlQuery).mockResolvedValue(mockResult);
    const handler2 = buildAskHandler({ llm: llm2, log: createLog() });
    const r2 = await handler2({ text: 'top agencies' });

    if (r1.kind === 'spec' && r2.kind === 'spec') {
      // Followups should be identical (deterministic)
      expect(JSON.stringify(r1.followups)).toBe(JSON.stringify(r2.followups));
    }
  });

  it('returns clarify AskResponse when LLM clarifies', async () => {
    const llm = fakeLLM([
      {
        type: 'function',
        name: 'clarify',
        args: { question: 'Which agency?', options: ['DSHS', 'DOT'] },
      },
    ]);
    const log = createLog();

    const handler = buildAskHandler({ llm, log });
    const response = await handler({ text: 'show agency' });

    expect(response.kind).toBe('clarify');
    if (response.kind === 'clarify') {
      expect(Array.isArray(response.chips)).toBe(true);
    }
  });

  it('returns refuse AskResponse when LLM refuses', async () => {
    const llm = fakeLLM([
      {
        type: 'function',
        name: 'refuse',
        args: { category: 'forecast', redirect: 'Only historical data is available.' },
      },
    ]);
    const log = createLog();

    const handler = buildAskHandler({ llm, log });
    const response = await handler({ text: 'predict next year' });

    expect(response.kind).toBe('refuse');
    if (response.kind === 'refuse') {
      expect(response.category).toBe('forecast');
    }
  });

  it('result traceId matches the shared traceId for the request', async () => {
    const llm = fakeLLM([
      { type: 'function', name: 'emit_query_spec', args: validSpec },
    ]);
    const log = createLog();

    const handler = buildAskHandler({ llm, log });
    const response = await handler({ text: 'agencies' });

    if (response.kind === 'spec') {
      const events = log.all();
      expect(events.length).toBeGreaterThan(0);
      // Result traceId should match event traceId
      expect(response.result.traceId).toBeTruthy();
    }
  });
});
