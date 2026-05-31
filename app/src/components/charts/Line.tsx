import { useEffect } from 'react';
import type { EChartsOption } from 'echarts';
import type { ChartProps, QueryResult } from '../../../contracts/index';
import { tokens } from '../../theme/tokens';
import { useEcharts } from './useEcharts';
import { ChartHeader, EmptyState } from './ChartShell';

// ── Pure option mapper ───────────────────────────────────────────────────────

export interface LineOption extends EChartsOption {
  __empty?: boolean;
}

export function lineOption(result: QueryResult): LineOption {
  if (result.rows.length === 0) {
    return { __empty: true };
  }

  // Check if rows have group fields → multi-series
  const hasGroups = result.rows.some(r => r.group != null);

  if (hasGroups) {
    // Collect unique groups and unique labels (x-axis)
    const groups = [...new Set(result.rows.map(r => r.group!))];
    const labels = [...new Set(result.rows.map(r => r.label))];

    const series = groups.map((grp, idx) => {
      const groupRows = result.rows.filter(r => r.group === grp);
      // Align values by label order
      const data = labels.map(lbl => {
        const row = groupRows.find(r => r.label === lbl);
        return row?.value ?? null;
      });
      return {
        type: 'line' as const,
        name: grp,
        data,
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: { color: tokens.series[idx % tokens.series.length] },
      };
    });

    return {
      grid: { left: 8, right: 16, top: 8, bottom: 24, containLabel: true },
      xAxis: { type: 'category', data: labels },
      yAxis: { type: 'value' },
      legend: { bottom: 0 },
      series,
    };
  }

  // Single series
  return {
    grid: { left: 8, right: 16, top: 8, bottom: 24, containLabel: true },
    xAxis: { type: 'category', data: result.rows.map(r => r.label) },
    yAxis: { type: 'value' },
    series: [
      {
        type: 'line',
        data: result.rows.map(r => r.value),
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: { color: tokens.lead },
      },
    ],
  };
}

// ── Component ────────────────────────────────────────────────────────────────

export function Line({ result, subtitle, onSelect, onExplain }: ChartProps) {
  const opt = lineOption(result);
  const containerRef = useEcharts(opt.__empty ? null : opt);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !onSelect || !result.spec.groupBy) return;

    import('echarts').then(({ getInstanceByDom }) => {
      const chart = getInstanceByDom(container);
      if (!chart) return;

      const handler = (params: { name: string }) => {
        onSelect({ dimension: result.spec.groupBy!, value: params.name });
      };
      chart.on('click', handler);
      return () => { chart.off('click', handler); };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, onSelect]);

  return (
    <div style={{ padding: 16 }}>
      <ChartHeader subtitle={subtitle} onExplain={onExplain} />
      {opt.__empty ? (
        <EmptyState result={result} />
      ) : (
        <div ref={containerRef} style={{ width: '100%', height: 300 }} />
      )}
    </div>
  );
}
