/**
 * GlassBox — collapsible AI activity log panel.
 *
 * Subscribes to a LogApi and renders each AIEvent as a plain-English row.
 * Features:
 *  - Engineer toggle: reveals raw JSON (input/output/params)
 *  - cached:true badge
 *  - token + latency display
 *  - "Download log" button exporting events as NDJSON
 */
import { useState, useEffect } from 'react';
import type { AIEvent, LogApi } from '../../contracts';
import { tokens } from '../theme/tokens';

/** Human-readable description of an AIEvent step+action. */
function describeEvent(e: AIEvent): string {
  switch (e.step) {
    case 'compile':
      return `Understood "${e.userAction}" — built a query`;
    case 'resolve':
      return `Resolved vendor names for "${e.userAction}"`;
    case 'compute':
      return `Computed results for "${e.userAction}"`;
    case 'narrate':
      return `Wrote plain-English interpretation for "${e.userAction}"`;
    case 'repair':
      return `Repaired/re-validated query for "${e.userAction}"`;
    case 'refuse':
      return `Declined to answer "${e.userAction}" (out of scope)`;
    default:
      return `Processed "${e.userAction}"`;
  }
}

interface GlassBoxProps {
  log: LogApi;
}

export function GlassBox({ log }: GlassBoxProps) {
  const [open, setOpen] = useState(false);
  const [engineer, setEngineer] = useState(false);
  const [events, setEvents] = useState<AIEvent[]>(() => log.all());

  useEffect(() => {
    // Seed from existing events
    setEvents(log.all());
    // Subscribe for new events
    const unsub = log.subscribe((e) => {
      setEvents((prev) => [...prev, e]);
    });
    return unsub;
  }, [log]);

  function downloadNdjson() {
    const ndjson = events.map((e) => JSON.stringify(e)).join('\n');
    const blob = new Blob([ndjson], { type: 'application/x-ndjson' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plainsight-ai-log.ndjson';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      style={{
        border: `1px solid ${tokens.line}`,
        borderRadius: 6,
        background: '#f9f7f3',
        fontFamily: tokens.fontSans,
        fontSize: 13,
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderBottom: open ? `1px solid ${tokens.line}` : 'none',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setOpen((v) => !v)}
        role="button"
        aria-expanded={open}
        aria-label="Toggle AI activity log"
      >
        <span style={{ fontSize: 11, color: tokens.muted }}>
          {open ? '▼' : '▶'}
        </span>
        <span style={{ fontWeight: 600, color: tokens.ink }}>AI Activity Log</span>
        <span
          style={{
            marginLeft: 4,
            background: tokens.lead,
            color: '#fff',
            borderRadius: 10,
            padding: '1px 7px',
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {events.length}
        </span>
        <span style={{ flex: 1 }} />
        {/* Engineer toggle — stopPropagation so it doesn't collapse panel */}
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={engineer}
            onChange={(e) => setEngineer(e.target.checked)}
            aria-label="Engineer mode"
            style={{ accentColor: tokens.lead }}
          />
          <span style={{ color: tokens.muted, fontSize: 11 }}>Engineer</span>
        </label>
      </div>

      {/* Event list */}
      {open && (
        <div style={{ padding: '8px 0' }}>
          {events.length === 0 && (
            <div style={{ padding: '8px 16px', color: tokens.muted }}>
              No AI activity yet.
            </div>
          )}
          {events.map((e, i) => (
            <EventRow key={`${e.traceId}-${e.step}-${i}`} event={e} engineer={engineer} />
          ))}

          {/* Download log button */}
          {events.length > 0 && (
            <div style={{ padding: '8px 12px', borderTop: `1px solid ${tokens.line}` }}>
              <button
                onClick={downloadNdjson}
                style={{
                  background: 'transparent',
                  border: `1px solid ${tokens.line}`,
                  borderRadius: 4,
                  padding: '4px 10px',
                  fontFamily: tokens.fontSans,
                  fontSize: 12,
                  color: tokens.ink,
                  cursor: 'pointer',
                }}
              >
                Download log
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface EventRowProps {
  event: AIEvent;
  engineer: boolean;
}

function EventRow({ event: e, engineer }: EventRowProps) {
  const hasModel = e.model || e.tokens || e.latencyMs;
  return (
    <div
      style={{
        padding: '6px 16px',
        borderBottom: `1px solid ${tokens.line}`,
        lineHeight: 1.4,
      }}
    >
      {/* Plain-English row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ color: tokens.ink }}>{describeEvent(e)}</span>

        {/* cached badge */}
        {e.cached && (
          <span
            style={{
              background: '#d4edda',
              color: '#155724',
              borderRadius: 4,
              padding: '1px 6px',
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            cached
          </span>
        )}

        {/* model · latency · tokens */}
        {hasModel && (
          <span
            style={{
              color: tokens.muted,
              fontSize: 11,
              fontFamily: tokens.fontMono,
            }}
          >
            {[
              e.model,
              e.latencyMs != null ? `${e.latencyMs}ms` : null,
              e.tokens ? `${e.tokens.input + e.tokens.output} tok` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
      </div>

      {/* Engineer mode: raw JSON */}
      {engineer && (
        <pre
          style={{
            margin: '6px 0 0',
            padding: '8px',
            background: '#1b1b18',
            color: '#d4d0c8',
            fontFamily: tokens.fontMono,
            fontSize: 11,
            borderRadius: 4,
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {JSON.stringify(
            {
              step: e.step,
              input: e.input,
              output: e.output,
              params: e.params,
              tokens: e.tokens,
              latencyMs: e.latencyMs,
              cached: e.cached,
            },
            null,
            2,
          )}
        </pre>
      )}
    </div>
  );
}
