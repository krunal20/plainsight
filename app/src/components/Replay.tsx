/**
 * Replay — re-runs result.spec via runQuery and asserts the new result
 * matches (deterministic). Shows "Reproduced identically" or a diff.
 * Also provides a "Copy link" button using encodeSpec (hash-based permalink).
 */
import { useState } from 'react';
import type { QueryResult, Cube } from '../../contracts';
import { runQuery } from '../lib/query/runQuery';
import { encodeSpec } from '../lib/permalink';
import { tokens } from '../theme/tokens';

interface ReplayProps {
  result: QueryResult;
  /** Pre-loaded cube required for runQuery's cube path. */
  cube: Cube;
}

type ReplayState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'match' }
  | { status: 'mismatch'; diff: string }
  | { status: 'error'; message: string };

function rowsEqual(a: QueryResult['rows'], b: QueryResult['rows']): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (row, i) => row.label === b[i].label && row.value === b[i].value && row.group === b[i].group,
  );
}

function buildDiff(original: QueryResult, replayed: QueryResult): string {
  const lines: string[] = [];
  if (original.rows.length !== replayed.rows.length) {
    lines.push(`Row count: ${original.rows.length} → ${replayed.rows.length}`);
  }
  const maxRows = Math.max(original.rows.length, replayed.rows.length);
  for (let i = 0; i < maxRows; i++) {
    const a = original.rows[i];
    const b = replayed.rows[i];
    if (!a) { lines.push(`+ row[${i}]: ${b.label} = ${b.value}`); continue; }
    if (!b) { lines.push(`- row[${i}]: ${a.label} = ${a.value}`); continue; }
    if (a.label !== b.label || a.value !== b.value) {
      lines.push(`~ row[${i}]: ${a.label}=${a.value} → ${b.label}=${b.value}`);
    }
  }
  return lines.join('\n') || '(no row differences, but metadata differs)';
}

export function Replay({ result, cube }: ReplayProps) {
  const [state, setState] = useState<ReplayState>({ status: 'idle' });
  const [copied, setCopied] = useState(false);

  async function handleReplay() {
    setState({ status: 'running' });
    try {
      const replayed = await runQuery(result.spec, { cube, traceId: result.traceId });
      if (rowsEqual(result.rows, replayed.rows)) {
        setState({ status: 'match' });
      } else {
        setState({ status: 'mismatch', diff: buildDiff(result, replayed) });
      }
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  function handleCopyLink() {
    const encoded = encodeSpec(result.spec);
    const hash = `#spec=${encoded}`;
    const url = `${window.location.origin}${window.location.pathname}${hash}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        fontFamily: tokens.fontSans,
        fontSize: 13,
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {/* Replay button */}
        <button
          onClick={handleReplay}
          disabled={state.status === 'running'}
          style={{
            background: state.status === 'running' ? tokens.muted : tokens.ink,
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            padding: '5px 14px',
            fontFamily: tokens.fontSans,
            fontSize: 13,
            cursor: state.status === 'running' ? 'default' : 'pointer',
          }}
          aria-label="Replay query"
        >
          {state.status === 'running' ? 'Running…' : 'Replay'}
        </button>

        {/* Copy link button */}
        <button
          onClick={handleCopyLink}
          style={{
            background: 'transparent',
            color: tokens.lead,
            border: `1px solid ${tokens.lead}`,
            borderRadius: 4,
            padding: '5px 14px',
            fontFamily: tokens.fontSans,
            fontSize: 13,
            cursor: 'pointer',
          }}
          aria-label="Copy permalink"
        >
          {copied ? 'Copied!' : 'Copy link'}
        </button>
      </div>

      {/* Status feedback */}
      {state.status === 'match' && (
        <div
          style={{
            color: '#155724',
            background: '#d4edda',
            borderRadius: 4,
            padding: '5px 10px',
            fontSize: 13,
          }}
          role="status"
          aria-live="polite"
        >
          Reproduced identically
        </div>
      )}

      {state.status === 'mismatch' && (
        <div
          style={{
            color: '#856404',
            background: '#fff3cd',
            borderRadius: 4,
            padding: '5px 10px',
            fontSize: 13,
          }}
          role="status"
          aria-live="polite"
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Results differ:</div>
          <pre
            style={{
              margin: 0,
              fontFamily: tokens.fontMono,
              fontSize: 11,
              whiteSpace: 'pre-wrap',
            }}
          >
            {state.diff}
          </pre>
        </div>
      )}

      {state.status === 'error' && (
        <div
          style={{
            color: '#721c24',
            background: '#f8d7da',
            borderRadius: 4,
            padding: '5px 10px',
            fontSize: 13,
          }}
          role="alert"
          aria-live="assertive"
        >
          Error: {state.message}
        </div>
      )}
    </div>
  );
}
