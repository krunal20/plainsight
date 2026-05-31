/**
 * T5.4 — log.ts
 *
 * Implements LogApi: in-memory ring buffer (cap ~200) + optional ndjson sink.
 * - ndjson sink only if filesystem writable (wrapped in try/catch)
 * - On Vercel: use /tmp, else ring-buffer-only
 * - Never throws
 */

import type { AIEvent, LogApi } from '../../../contracts';

const RING_CAP = 200;

export function createLog(options?: { filePath?: string }): LogApi {
  const buffer: AIEvent[] = [];
  const subscribers: Set<(e: AIEvent) => void> = new Set();

  // Attempt to set up ndjson file sink (server-only, optional)
  let fileSink: ((line: string) => void) | null = null;
  if (options?.filePath || typeof process !== 'undefined') {
    try {
      // Use provided path or try /tmp/plainsight-ai.ndjson on Vercel
      const sinkPath = options?.filePath ?? (
        // Only in Node environments (not browser/jsdom)
        typeof process !== 'undefined' && process.env.VERCEL
          ? '/tmp/plainsight-ai.ndjson'
          : null
      );
      if (sinkPath && typeof process !== 'undefined') {
        // Lazy require — safe because log.ts is only used server-side in production
        // In test/jsdom environments this will silently fail
        const fs = (() => {
          try { return require('fs'); } catch { return null; }
        })();
        if (fs) {
          fileSink = (line: string) => {
            try {
              fs.appendFileSync(sinkPath, line + '\n', 'utf8');
            } catch {
              // Swallow filesystem errors silently
            }
          };
        }
      }
    } catch {
      // Never throw from log setup
    }
  }

  function append(event: AIEvent): void {
    // Add to ring buffer
    buffer.push(event);
    // Drop oldest if over cap
    if (buffer.length > RING_CAP) {
      buffer.shift();
    }

    // Notify subscribers
    for (const cb of subscribers) {
      try { cb(event); } catch { /* swallow subscriber errors */ }
    }

    // Write to ndjson sink
    if (fileSink) {
      try {
        fileSink(JSON.stringify(event));
      } catch {
        // Never throw
      }
    }
  }

  function subscribe(cb: (e: AIEvent) => void): () => void {
    subscribers.add(cb);
    return () => { subscribers.delete(cb); };
  }

  function all(): AIEvent[] {
    return [...buffer];
  }

  return { subscribe, append, all };
}
