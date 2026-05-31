/**
 * InterpretationChip — renders a plain-English read-back of result.spec
 * AND is editable: clicking a facet opens a small inline editor (dropdowns
 * / steppers for measure, netGross, topN, groupBy). On apply, calls onApply
 * with the adjusted QuerySpec.
 */
import { useState } from 'react';
import type { QuerySpec, Agg, Dimension } from '../../contracts';
import { tokens } from '../theme/tokens';

// ── helpers ──────────────────────────────────────────────────────────────────

function aggLabel(agg: Agg): string {
  const map: Record<Agg, string> = {
    sum: 'Total',
    avg: 'Average',
    count: 'Count',
    distinct_count: 'Distinct count',
    share: 'Share',
    yoy_delta: 'YoY change',
  };
  return map[agg] ?? agg;
}

function groupByLabel(g: Dimension | undefined): string {
  if (!g) return '';
  const map: Record<Dimension, string> = {
    agency: 'Agency',
    category: 'Category',
    subcategory: 'Subcategory',
    vendor: 'Vendor',
    fy: 'Fiscal year',
    month: 'Month',
  };
  return map[g] ?? g;
}

function fyLabel(fys: (2022 | 2023)[] | undefined): string {
  if (!fys || fys.length === 0) return 'All years';
  return fys.map((y) => `FY${String(y).slice(2)}`).join(', ');
}

/** Build a one-liner description like "Amount · by Vendor · FY2023 · top 10" */
function buildLabel(spec: QuerySpec): string {
  const parts: string[] = [];
  parts.push(`${aggLabel(spec.agg)} amount`);
  if (spec.groupBy) parts.push(`by ${groupByLabel(spec.groupBy)}`);
  if (spec.filters.fy?.length) parts.push(fyLabel(spec.filters.fy));
  if (spec.topN) parts.push(`top ${spec.topN}`);
  parts.push(spec.netGross === 'net' ? 'net' : 'gross');
  return parts.join(' · ');
}

// ── component ─────────────────────────────────────────────────────────────────

interface InterpretationChipProps {
  spec: QuerySpec;
  onApply: (newSpec: QuerySpec) => void;
}

export function InterpretationChip({ spec, onApply }: InterpretationChipProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<QuerySpec>(spec);

  function openEditor() {
    setDraft(spec);
    setEditing(true);
  }

  function handleApply() {
    setEditing(false);
    onApply(draft);
  }

  function handleCancel() {
    setEditing(false);
    setDraft(spec);
  }

  if (!editing) {
    return (
      <button
        onClick={openEditor}
        title="Click to edit interpretation"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: '#ece8e0',
          border: `1px solid ${tokens.line}`,
          borderRadius: 20,
          padding: '4px 12px',
          fontFamily: tokens.fontSans,
          fontSize: 13,
          color: tokens.ink,
          cursor: 'pointer',
        }}
        aria-label="Edit query interpretation"
      >
        {buildLabel(spec)}
        <span style={{ color: tokens.muted, fontSize: 11 }}>edit</span>
      </button>
    );
  }

  // ── Inline editor ─────────────────────────────────────────────────────────
  return (
    <div
      style={{
        border: `1px solid ${tokens.lead}`,
        borderRadius: 8,
        padding: '12px 14px',
        background: tokens.paper,
        fontFamily: tokens.fontSans,
        fontSize: 13,
        display: 'inline-flex',
        flexDirection: 'column',
        gap: 10,
      }}
      role="group"
      aria-label="Edit query"
    >
      {/* Aggregation */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: tokens.muted, width: 70 }}>Measure</span>
        <select
          value={draft.agg}
          onChange={(e) => setDraft({ ...draft, agg: e.target.value as Agg })}
          style={selectStyle}
          aria-label="Aggregation"
        >
          <option value="sum">Sum (total)</option>
          <option value="avg">Average</option>
          <option value="count">Count</option>
          <option value="distinct_count">Distinct count</option>
          <option value="share">Share (%)</option>
          <option value="yoy_delta">YoY change</option>
        </select>
      </label>

      {/* Net / Gross */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: tokens.muted, width: 70 }}>Net/Gross</span>
        <select
          value={draft.netGross}
          onChange={(e) =>
            setDraft({ ...draft, netGross: e.target.value as 'net' | 'gross' })
          }
          style={selectStyle}
          aria-label="Net or Gross"
        >
          <option value="net">Net (refunds deducted)</option>
          <option value="gross">Gross (before refunds)</option>
        </select>
      </label>

      {/* Group by */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: tokens.muted, width: 70 }}>Group by</span>
        <select
          value={draft.groupBy ?? ''}
          onChange={(e) =>
            setDraft({
              ...draft,
              groupBy: (e.target.value as Dimension) || undefined,
            })
          }
          style={selectStyle}
          aria-label="Group by"
        >
          <option value="">— none (scalar) —</option>
          <option value="agency">Agency</option>
          <option value="vendor">Vendor</option>
          <option value="category">Category</option>
          <option value="subcategory">Subcategory</option>
          <option value="fy">Fiscal year</option>
          <option value="month">Month</option>
        </select>
      </label>

      {/* Top N */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: tokens.muted, width: 70 }}>Top N</span>
        <input
          type="number"
          min={1}
          max={50}
          value={draft.topN ?? 10}
          onChange={(e) =>
            setDraft({ ...draft, topN: Math.max(1, Math.min(50, Number(e.target.value))) })
          }
          style={{ ...selectStyle, width: 70 }}
          aria-label="Top N"
        />
      </label>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleApply}
          style={{
            background: tokens.lead,
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            padding: '5px 14px',
            fontFamily: tokens.fontSans,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Apply
        </button>
        <button
          onClick={handleCancel}
          style={{
            background: 'transparent',
            color: tokens.muted,
            border: `1px solid ${tokens.line}`,
            borderRadius: 4,
            padding: '5px 14px',
            fontFamily: tokens.fontSans,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  fontFamily: 'inherit',
  fontSize: 13,
  padding: '3px 6px',
  border: `1px solid ${tokens.line}`,
  borderRadius: 4,
  background: '#fff',
  color: tokens.ink,
};
