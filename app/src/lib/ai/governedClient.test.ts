/**
 * T5.4 — governedClient tests
 *
 * governedClient wraps an LLM so EVERY call appends an AIEvent (the "one door").
 * - one compile call → exactly one AIEvent with step:'compile' and raw input recorded
 */

import { describe, it, expect } from 'vitest';
import { createGovernedClient } from './governedClient';
import { fakeLLM } from './llm';
import { createLog } from './log';

describe('governedClient', () => {
  it('one compileFunctions call → exactly one AIEvent with step:compile', async () => {
    const log = createLog();
    const llm = fakeLLM([
      { type: 'function', name: 'emit_query_spec', args: { intent: 'rank' } },
    ]);
    const client = createGovernedClient(llm, log, 'trace-abc');

    await client.compileFunctions('sys', 'user query', [], 'compile');

    const events = log.all();
    expect(events).toHaveLength(1);
    expect(events[0].step).toBe('compile');
    expect(events[0].traceId).toBe('trace-abc');
  });

  it('records raw input text in the AIEvent', async () => {
    const log = createLog();
    const llm = fakeLLM([
      { type: 'function', name: 'emit_query_spec', args: {} },
    ]);
    const client = createGovernedClient(llm, log, 'trace-xyz');

    await client.compileFunctions('sys prompt', 'my query text', [], 'compile');

    const events = log.all();
    expect(events[0].input.rawText).toBe('my query text');
  });

  it('records output in the AIEvent', async () => {
    const log = createLog();
    const llm = fakeLLM([
      { type: 'function', name: 'refuse', args: { category: 'causal' } },
    ]);
    const client = createGovernedClient(llm, log, 'trace-1');

    await client.compileFunctions('sys', 'user', [], 'compile');

    const events = log.all();
    expect(events[0].output).toBeDefined();
  });

  it('logs complete() calls with step:narrate', async () => {
    const log = createLog();
    const llm = fakeLLM([
      { type: 'complete', text: 'DSHS got $2.7M.', tokens: { input: 50, output: 10 } },
    ]);
    const client = createGovernedClient(llm, log, 'trace-n');

    await client.complete('sys', 'narrate this', 'narrate');

    const events = log.all();
    expect(events).toHaveLength(1);
    expect(events[0].step).toBe('narrate');
    expect(events[0].tokens?.input).toBe(50);
  });

  it('each call appends its own event (two calls → two events)', async () => {
    const log = createLog();
    const llm = fakeLLM([
      { type: 'function', name: 'fn1', args: {} },
      { type: 'function', name: 'fn2', args: {} },
    ]);
    const client = createGovernedClient(llm, log, 'trace-multi');

    await client.compileFunctions('sys', 'q1', [], 'compile');
    await client.compileFunctions('sys', 'q2', [], 'repair');

    const events = log.all();
    expect(events).toHaveLength(2);
    expect(events[0].step).toBe('compile');
    expect(events[1].step).toBe('repair');
  });
});
