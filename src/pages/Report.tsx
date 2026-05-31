/**
 * Report — renders an AskResponse from /api/ask.
 *
 * Handles all three kinds:
 *   kind:'spec'    → chart(s) + InterpretationChip (editable) + ShowSql + Replay + narration + follow-up chips
 *   kind:'clarify' → clarifying chips the user can click to re-submit
 *   kind:'refuse'  → graceful refusal with category label + redirect hint
 *
 * AskBar routes its result here via store.askResult.
 */
import { useState, useCallback } from 'react';
import type { AskResponse, QuerySpec, QueryResult } from '../../contracts';
import { InterpretationChip } from '../components/InterpretationChip';
import { ShowSql } from '../components/ShowSql';
import { useStore } from '../state/store';
import { tokens } from '../theme/tokens';
import { Bar } from '../components/charts/Bar';
import { Line } from '../components/charts/Line';
import { Treemap } from '../components/charts/Treemap';

// ── helpers ────────────────────────────────────────────────────────────────────

function chartForSpec(result: QueryResult, subtitle: string, key?: string) {
  const chart = result.spec.chart;
  if (chart === 'bar') return <Bar key={key} result={result} subtitle={subtitle} />;
  if (chart === 'line') return <Line key={key} result={result} subtitle={subtitle} />;
  if (chart === 'treemap') return <Treemap key={key} result={result} subtitle={subtitle} />;
  // Fallback to bar
  return <Bar key={key} result={result} subtitle={subtitle} />;
}

const REFUSE_LABELS: Record<string, string> = {
  causal:    'Causal inference (beyond the data)',
  invoice:   'Invoice-level detail',
  geography: 'Geographic breakdown',
  budget:    'Budget / appropriations',
  forecast:  'Forecasting / projection',
};

// ── Replay button ──────────────────────────────────────────────────────────────

interface ReplayProps {
  query: string;
  onReplay: (q: string) => void;
  loading: boolean;
}

function Replay({ query, onReplay, loading }: ReplayProps) {
  return (
    <button
      onClick={() => onReplay(query)}
      disabled={loading}
      aria-label="Replay query"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: 'transparent',
        border: `1px solid ${tokens.line}`,
        borderRadius: 6,
        padding: '5px 12px',
        fontFamily: tokens.fontSans,
        fontSize: 12,
        color: loading ? tokens.muted : tokens.ink,
        cursor: loading ? 'default' : 'pointer',
      }}
    >
      {loading ? 'Running…' : 'Replay'}
    </button>
  );
}

// ── Narration panel ────────────────────────────────────────────────────────────

interface NarrationProps {
  interpretation: string;
  onExplain: () => void;
  explainLoading: boolean;
  narrative?: string;
}

function NarrationPanel({ interpretation, onExplain, explainLoading, narrative }: NarrationProps) {
  return (
    <div
      style={{
        background: `${tokens.lead}08`,
        border: `1px solid ${tokens.lead}30`,
        borderRadius: 8,
        padding: '14px 18px',
      }}
    >
      <p style={{ margin: 0, fontFamily: tokens.fontSans, fontSize: 14, color: tokens.ink, lineHeight: 1.6 }}>
        {narrative ?? interpretation}
      </p>
      {!narrative && (
        <button
          onClick={onExplain}
          disabled={explainLoading}
          style={{
            marginTop: 8,
            background: 'none',
            border: 'none',
            padding: 0,
            fontFamily: tokens.fontSans,
            fontSize: 12,
            color: tokens.lead,
            cursor: explainLoading ? 'default' : 'pointer',
            fontWeight: 500,
          }}
        >
          {explainLoading ? 'Generating explanation…' : 'Explain in plain English ›'}
        </button>
      )}
    </div>
  );
}

// ── Follow-up chip ─────────────────────────────────────────────────────────────

interface FollowUpChipProps {
  spec: QuerySpec;
  onRun: (spec: QuerySpec) => void;
}

function FollowUpChip({ spec, onRun }: FollowUpChipProps) {
  const label = [
    spec.agg,
    spec.groupBy ? `by ${spec.groupBy}` : '',
    spec.filters.fy?.length ? `FY${spec.filters.fy.join('/')}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <button
      onClick={() => onRun(spec)}
      style={{
        padding: '5px 12px',
        background: tokens.paper,
        border: `1px solid ${tokens.line}`,
        borderRadius: 16,
        fontFamily: tokens.fontSans,
        fontSize: 12,
        color: tokens.ink,
        cursor: 'pointer',
        transition: 'border-color 0.1s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = tokens.lead; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = tokens.line; }}
    >
      {label}
    </button>
  );
}

// ── Report ─────────────────────────────────────────────────────────────────────

interface ReportProps {
  /** The AskResponse to render. If undefined, renders a blank state. */
  response?: AskResponse | null;
  /** The raw query text (for Replay). */
  query?: string;
  /** Called when the user edits the InterpretationChip and hits Apply. */
  onRerunSpec?: (spec: QuerySpec) => void;
}

export function Report({ response, query = '', onRerunSpec }: ReportProps) {
  const setActiveTab = useStore(s => s.setActiveTab);

  const [narrative,      setNarrative]      = useState<string | undefined>(undefined);
  const [explainLoading, setExplainLoading] = useState(false);
  const [replayLoading,  setReplayLoading]  = useState(false);

  // ── handlers ──────────────────────────────────────────────────────────────

  const handleExplain = useCallback(async () => {
    if (!response || response.kind !== 'spec') return;
    setExplainLoading(true);
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: query, explain: true }),
      });
      if (!res.ok) return; // silently skip if server error
      const data = (await res.json()) as AskResponse;
      if (data.kind === 'spec') {
        setNarrative(data.interpretation);
      }
    } catch {
      // ignore — explain is optional
    } finally {
      setExplainLoading(false);
    }
  }, [response, query]);

  const handleReplay = useCallback(
    async (q: string) => {
      setReplayLoading(true);
      try {
        const res = await fetch('/api/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: q }),
        });
        if (!res.ok) {
          const fallback: AskResponse = {
            kind: 'clarify',
            chips: [{
              label: "Live AI isn't available on this deployment yet — set a free GEMINI_API_KEY in the Vercel env to enable natural-language questions. Everything in the dashboard already works without it.",
            }],
          };
          useStore.getState().setAskResult(fallback);
          return;
        }
        const data = (await res.json()) as AskResponse;
        useStore.getState().setAskResult(data);
      } catch {
        // ignore
      } finally {
        setReplayLoading(false);
      }
    },
    []
  );

  const handleFollowUp = useCallback(
    async (spec: QuerySpec) => {
      if (onRerunSpec) {
        onRerunSpec(spec);
        return;
      }
      // Serialise back to a text query and re-submit
      const label = `${spec.agg} by ${spec.groupBy ?? 'total'}`;
      await handleReplay(label);
    },
    [onRerunSpec, handleReplay]
  );

  const handleApplyChip = useCallback(
    (newSpec: QuerySpec) => {
      if (onRerunSpec) {
        onRerunSpec(newSpec);
      }
    },
    [onRerunSpec]
  );

  // ── Blank state ───────────────────────────────────────────────────────────

  if (!response) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 80,
          gap: 12,
          fontFamily: tokens.fontSans,
        }}
      >
        <div style={{ width: 40, height: 40, background: tokens.line, borderRadius: 8 }} />
        <p style={{ fontSize: 15, color: tokens.muted, margin: 0 }}>
          Ask a question above to see results here.
        </p>
      </div>
    );
  }

  // ── kind: 'clarify' ───────────────────────────────────────────────────────

  if (response.kind === 'clarify') {
    return (
      <div style={{ padding: 24, fontFamily: tokens.fontSans }}>
        <p style={{ fontSize: 14, color: tokens.ink, marginBottom: 16 }}>
          Could you clarify what you mean? Choose one:
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {response.chips.map((chip, i) => (
            <button
              key={i}
              data-testid="clarify-chip"
              onClick={() => chip.spec
                ? handleFollowUp(chip.spec as QuerySpec)
                : handleReplay(chip.label)
              }
              style={{
                padding: '7px 14px',
                background: tokens.paper,
                border: `1px solid ${tokens.lead}`,
                borderRadius: 20,
                fontFamily: tokens.fontSans,
                fontSize: 13,
                color: tokens.ink,
                cursor: 'pointer',
              }}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── kind: 'refuse' ────────────────────────────────────────────────────────

  if (response.kind === 'refuse') {
    return (
      <div
        data-testid="refuse-panel"
        style={{
          padding: 24,
          fontFamily: tokens.fontSans,
          border: `1px solid ${tokens.line}`,
          borderRadius: 8,
          background: tokens.paper,
          maxWidth: 480,
          margin: '24px auto',
        }}
      >
        <div style={{ fontSize: 11, color: tokens.muted, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>
          Out of scope
        </div>
        <p style={{ fontSize: 14, color: tokens.ink, margin: '0 0 12px' }}>
          This question involves <strong>{REFUSE_LABELS[response.category] ?? response.category}</strong>, which is outside what Plainsight can answer with spending data.
        </p>
        <p style={{ fontSize: 13, color: tokens.muted, margin: '0 0 16px' }}>
          {response.redirect}
        </p>
        <button
          onClick={() => setActiveTab('overview')}
          style={{
            padding: '6px 14px',
            background: tokens.lead,
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontFamily: tokens.fontSans,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Back to Overview
        </button>
      </div>
    );
  }

  // ── kind: 'spec' ──────────────────────────────────────────────────────────

  const { result, interpretation, followups } = response;

  return (
    <div style={{ padding: 24, fontFamily: tokens.fontSans, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Interpretation chip (editable) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <InterpretationChip spec={result.spec} onApply={handleApplyChip} />
        {query && (
          <Replay query={query} onReplay={handleReplay} loading={replayLoading} />
        )}
      </div>

      {/* Narration */}
      <NarrationPanel
        interpretation={interpretation}
        onExplain={handleExplain}
        explainLoading={explainLoading}
        narrative={narrative}
      />

      {/* Chart */}
      <div
        style={{
          border: `1px solid ${tokens.line}`,
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        {chartForSpec(result, interpretation, result.traceId)}
      </div>

      {/* Show SQL */}
      <ShowSql result={result} />

      {/* Follow-up chips */}
      {followups.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: tokens.muted, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
            Explore further
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {followups.map((spec, i) => (
              <FollowUpChip key={i} spec={spec} onRun={handleFollowUp} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
