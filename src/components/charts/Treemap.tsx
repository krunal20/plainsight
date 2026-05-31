import { useEffect } from 'react';
import type { EChartsOption } from 'echarts';
import type { ChartProps, QueryResult } from '../../../contracts/index';
import { tokens } from '../../theme/tokens';
import { useEcharts } from './useEcharts';
import { ChartHeader, EmptyState } from './ChartShell';

// ── Pure option mapper ───────────────────────────────────────────────────────

export interface TreemapOption extends EChartsOption {
  __empty?: boolean;
}

export function treemapOption(result: QueryResult): TreemapOption {
  if (result.rows.length === 0) {
    return { __empty: true };
  }
  return {
    series: [
      {
        type: 'treemap',
        data: result.rows.map(r => ({ name: r.label, value: r.value })),
        itemStyle: {
          borderColor: tokens.paper,
          borderWidth: 2,
        },
        label: {
          fontFamily: tokens.fontSans,
          color: tokens.card,
        },
        levels: [
          {
            itemStyle: {
              borderColor: tokens.line,
              borderWidth: 1,
              gapWidth: 2,
            },
          },
        ],
      },
    ],
  };
}

// ── Component ────────────────────────────────────────────────────────────────

export function Treemap({ result, subtitle, onSelect, onExplain }: ChartProps) {
  const opt = treemapOption(result);
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
        <div ref={containerRef} style={{ width: '100%', height: 350 }} />
      )}
    </div>
  );
}
