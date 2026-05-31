import { useEffect } from 'react';
import type { EChartsOption } from 'echarts';
import type { ChartProps, QueryResult } from '../../../contracts/index';
import { tokens } from '../../theme/tokens';
import { useEcharts } from './useEcharts';
import { ChartHeader, EmptyState } from './ChartShell';

// ── Pure option mapper ───────────────────────────────────────────────────────

// Extend EChartsOption with a sentinel field for the empty-state branch
export interface BarOption extends EChartsOption {
  __empty?: boolean;
}

export function barOption(result: QueryResult): BarOption {
  if (result.rows.length === 0) {
    return { __empty: true };
  }
  return {
    grid: { left: 8, right: 16, top: 8, bottom: 24, containLabel: true },
    xAxis: { type: 'category', data: result.rows.map(x => x.label) },
    yAxis: { type: 'value' },
    series: [
      {
        type: 'bar',
        data: result.rows.map(x => x.value),
        itemStyle: { color: tokens.lead },
      },
    ],
  };
}

// ── Component ────────────────────────────────────────────────────────────────

export function Bar({ result, subtitle, onSelect, onExplain }: ChartProps) {
  const opt = barOption(result);
  const containerRef = useEcharts(opt.__empty ? null : opt);

  // Wire click handler after mount
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
