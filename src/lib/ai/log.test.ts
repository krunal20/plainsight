/**
 * T5.4 — log.ts tests
 *
 * LogApi implementation: in-memory ring buffer (cap ~200) + ndjson sink.
 * - subscribe/append/all
 * - ndjson sink only if filesystem writable (wrapped in try/catch)
 * - never throw on filesystem errors
 */

import { describe, it, expect } from 'vitest';
import { createLog } from './log';
import type { AIEvent } from '../../../contracts';

function makeEvent(step: AIEvent['step'], traceId = 'trace-1'): AIEvent {
  return {
    traceId,
    ts: new Date().toISOString(),
    step,
    userAction: 'test',
    input: { rawText: 'hello' },
  };
}

describe('createLog', () => {
  it('appends events and returns them via all()', () => {
    const log = createLog();
    const e1 = makeEvent('compile');
    const e2 = makeEvent('narrate');
    log.append(e1);
    log.append(e2);
    const all = log.all();
    expect(all).toHaveLength(2);
    expect(all[0].step).toBe('compile');
    expect(all[1].step).toBe('narrate');
  });

  it('subscribe receives events as they are appended', () => {
    const log = createLog();
    const received: AIEvent[] = [];
    log.subscribe(e => received.push(e));
    log.append(makeEvent('compile'));
    log.append(makeEvent('narrate'));
    expect(received).toHaveLength(2);
  });

  it('unsubscribe stops receiving events', () => {
    const log = createLog();
    const received: AIEvent[] = [];
    const unsub = log.subscribe(e => received.push(e));
    log.append(makeEvent('compile'));
    unsub();
    log.append(makeEvent('narrate'));
    expect(received).toHaveLength(1);
  });

  it('multiple subscribers all receive events', () => {
    const log = createLog();
    const r1: AIEvent[] = [];
    const r2: AIEvent[] = [];
    log.subscribe(e => r1.push(e));
    log.subscribe(e => r2.push(e));
    log.append(makeEvent('compile'));
    expect(r1).toHaveLength(1);
    expect(r2).toHaveLength(1);
  });

  it('ring buffer caps at 200 events (oldest dropped)', () => {
    const log = createLog();
    for (let i = 0; i < 210; i++) {
      log.append(makeEvent('compile', `trace-${i}`));
    }
    const all = log.all();
    expect(all).toHaveLength(200);
    // Oldest 10 should have been dropped; newest should be trace-209
    expect(all[all.length - 1].traceId).toBe('trace-209');
  });

  it('does not throw even if a filesystem sink is unavailable', () => {
    // createLog should never throw, even in environments with no FS
    expect(() => createLog()).not.toThrow();
    const log = createLog();
    expect(() => log.append(makeEvent('compile'))).not.toThrow();
  });

  it('all() returns a copy (mutating the returned array does not affect internal state)', () => {
    const log = createLog();
    log.append(makeEvent('compile'));
    const a = log.all();
    a.pop();
    expect(log.all()).toHaveLength(1);
  });
});
