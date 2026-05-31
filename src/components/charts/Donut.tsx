import { useEffect } from 'react';
import type { EChartsOption } from 'echarts';
import type { ChartProps, QueryResult } from '../../../contracts/index';
import { tokens } from '../../theme/tokens';
import { useEcharts } from './useEcharts';
import { ChartHeader, EmptyState } from './ChartShell';

// ── Pure option mapper ───────────────────────────────────────────────────────

export interface DonutOption extends EChartsOption {
  __empty?: boolean;
}

export function donutOption(result: QueryResult): DonutOption {
  if (result.rows.length === 0) {
    return { __empty: true };
  }
  return {
    tooltip: {
      trigger: 'item',
    },
    legend: {
      bottom: 0,
      textStyle: {
        fontFamily: tokens.fontSans,
        color: tokens.ink,
      },
    },
    series: [
      {
        type: 'pie',
        radius: ['45%', '70%'],
        data: result.rows.map((r, i) => ({
          name: r.label,
          value: r.value,
          itemStyle: {
            color: tokens.series[i % tokens.series.length],
          },
        })),
        label: {
          fontFamily: tokens.fontSans,
          color: tokens.ink,
        },
        itemStyle: {
          borderColor: tokens.paper,
          borderWidth: 2,
        },
      },
    ],
  };
}

// ── Component ────────────────────────────────────────────────────────────────

export function Donut({ result, subtitle, onSelect, onExplain }: ChartProps) {
  const opt = donutOption(result);
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
        <div ref={containerRef} style={{ width: '100%', height: 320 }} />
      )}
    </div>
  );
}
