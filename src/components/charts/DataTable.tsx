import { useRef, useCallback, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ChartProps, QueryResult } from '../../../contracts/index';
import { tokens } from '../../theme/tokens';
import { ChartHeader, EmptyState } from './ChartShell';

// ── CSV helper ───────────────────────────────────────────────────────────────

function rowsToCSV(
  rows: QueryResult['rows'],
  columns: QueryResult['columns'],
): string {
  const header = columns.map(c => JSON.stringify(c.label)).join(',');
  const lines = rows.map(row => {
    return columns
      .map(col => {
        const val = col.key === 'label' ? row.label : row.value;
        return typeof val === 'string' ? JSON.stringify(val) : val;
      })
      .join(',');
  });
  return [header, ...lines].join('\n');
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Constants ────────────────────────────────────────────────────────────────

const ROW_HEIGHT = 36;
// Only virtualize when there are many rows; small datasets render directly
const VIRTUALIZE_THRESHOLD = 50;
const MAX_VISIBLE_ROWS = 12;

// ── VirtualBody (only mounted when row count >= VIRTUALIZE_THRESHOLD) ────────

interface VirtualBodyProps {
  rows: ReturnType<ReturnType<typeof useReactTable>['getRowModel']>['rows'];
  parentRef: React.RefObject<HTMLDivElement | null>;
}

function VirtualBody({ rows, parentRef }: VirtualBodyProps) {
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  return (
    <tbody
      style={{
        height: virtualizer.getTotalSize(),
        position: 'relative',
        display: 'block',
      }}
    >
      {virtualizer.getVirtualItems().map(virtualRow => {
        const row = rows[virtualRow.index];
        return (
          <tr
            key={row.id}
            style={{
              position: 'absolute',
              top: virtualRow.start,
              left: 0,
              width: '100%',
              height: ROW_HEIGHT,
              display: 'table',
              tableLayout: 'fixed',
            }}
          >
            {row.getVisibleCells().map(cell => (
              <td
                key={cell.id}
                style={tdStyle}
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        );
      })}
    </tbody>
  );
}

const tdStyle: React.CSSProperties = {
  padding: '0 12px',
  height: ROW_HEIGHT,
  lineHeight: `${ROW_HEIGHT}px`,
  borderBottom: `1px solid ${tokens.line}`,
  color: tokens.ink,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

// ── StaticBody (small datasets, always renders all rows in DOM) ──────────────

interface StaticBodyProps {
  rows: ReturnType<ReturnType<typeof useReactTable>['getRowModel']>['rows'];
}

function StaticBody({ rows }: StaticBodyProps) {
  return (
    <tbody>
      {rows.map(row => (
        <tr key={row.id}>
          {row.getVisibleCells().map(cell => (
            <td key={cell.id} style={tdStyle}>
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function DataTable({ result, subtitle, onExplain }: ChartProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const parentRef = useRef<HTMLDivElement>(null);

  // Build column defs from result.columns
  const columnDefs: ColumnDef<(typeof result.rows)[number]>[] = result.columns.map(col => ({
    id: col.key,
    header: col.label,
    accessorFn: (row: (typeof result.rows)[number]) =>
      col.key === 'label' ? row.label : row.value,
    cell: (info: { getValue: () => unknown }) => {
      const val = info.getValue();
      if (col.type === 'currency' && typeof val === 'number') {
        return (
          <span style={{ fontFamily: tokens.fontMono }}>
            {`$${val.toLocaleString()}`}
          </span>
        );
      }
      return String(val ?? '');
    },
    sortingFn: col.type === 'number' || col.type === 'currency' ? 'basic' : 'alphanumeric',
  }));

  const table = useReactTable({
    data: result.rows,
    columns: columnDefs,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const { rows } = table.getRowModel();
  const useVirtual = rows.length >= VIRTUALIZE_THRESHOLD;

  const handleDownload = useCallback(() => {
    const csv = rowsToCSV(
      table.getRowModel().rows.map(r => r.original),
      result.columns,
    );
    downloadCSV(csv, 'plainsight-data.csv');
  }, [table, result.columns]);

  const isEmpty = result.rows.length === 0;

  return (
    <div style={{ padding: 16 }}>
      <ChartHeader subtitle={subtitle} onExplain={onExplain} />

      {isEmpty ? (
        <EmptyState result={result} />
      ) : (
        <>
          <div
            ref={parentRef}
            style={{
              overflow: 'auto',
              maxHeight: ROW_HEIGHT * MAX_VISIBLE_ROWS + ROW_HEIGHT,
              border: `1px solid ${tokens.line}`,
              borderRadius: 4,
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontFamily: tokens.fontSans,
                fontSize: 13,
                tableLayout: useVirtual ? undefined : 'auto',
              }}
            >
              <thead>
                {table.getHeaderGroups().map(hg => (
                  <tr key={hg.id}>
                    {hg.headers.map(header => (
                      <th
                        key={header.id}
                        onClick={header.column.getToggleSortingHandler()}
                        style={{
                          padding: '8px 12px',
                          textAlign: 'left',
                          fontWeight: 600,
                          color: tokens.ink,
                          background: tokens.paper,
                          borderBottom: `1px solid ${tokens.line}`,
                          cursor: header.column.getCanSort() ? 'pointer' : 'default',
                          userSelect: 'none',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === 'asc' ? ' ▲' :
                         header.column.getIsSorted() === 'desc' ? ' ▼' : ''}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              {useVirtual ? (
                <VirtualBody rows={rows} parentRef={parentRef} />
              ) : (
                <StaticBody rows={rows} />
              )}
            </table>
          </div>

          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={handleDownload}
              style={{
                background: 'none',
                border: `1px solid ${tokens.line}`,
                borderRadius: 4,
                padding: '4px 12px',
                cursor: 'pointer',
                fontSize: 12,
                color: tokens.muted,
                fontFamily: tokens.fontSans,
              }}
            >
              Download CSV
            </button>
          </div>
        </>
      )}
    </div>
  );
}
