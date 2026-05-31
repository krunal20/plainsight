import { useEffect } from 'react';
import type { EChartsOption } from 'echarts';
import type { ChartProps, QueryResult } from '../../../contracts/index';
import { tokens } from '../../theme/tokens';
import { useEcharts } from './useEcharts';
import { ChartHeader, EmptyState } from './ChartShell';

// ── Pure option mapper ───────────────────────────────────────────────────────

export interface HeatmapOption extends EChartsOption {
  __empty?: boolean;
}

export function heatmapOption(result: QueryResult): HeatmapOption {
  if (result.rows.length === 0) {
    return { __empty: true };
  }

  // x = group (e.g. month), y = label (e.g. agency)
  const xLabels = [...new Set(result.rows.map(r => r.group ?? r.label))];
  const yLabels = [...new Set(result.rows.map(r => r.label))];

  const data = result.rows.map(r => {
    const xi = xLabels.indexOf(r.group ?? r.label);
    const yi = yLabels.indexOf(r.label);
    return [xi, yi, r.value] as [number, number, number];
  });

  const maxValue = Math.max(...result.rows.map(r => r.value), 1);

  return {
    grid: { left: 8, right: 60, top: 8, bottom: 40, containLabel: true },
    xAxis: {
      type: 'category',
      data: xLabels,
      splitArea: { show: true },
      axisLabel: { fontFamily: tokens.fontSans, color: tokens.muted },
    },
    yAxis: {
      type: 'category',
      data: yLabels,
      splitArea: { show: true },
      axisLabel: { fontFamily: tokens.fontSans, color: tokens.muted },
    },
    visualMap: {
      min: 0,
      max: maxValue,
      calculable: true,
      orient: 'vertical',
      right: 0,
      top: 'center',
      inRange: {
        color: [tokens.paper, tokens.lead],
      },
    },
    series: [
      {
        type: 'heatmap',
        data,
        label: {
          show: false,
        },
        itemStyle: {
          borderColor: tokens.line,
          borderWidth: 1,
        },
      },
    ],
  };
}

// ── Component ────────────────────────────────────────────────────────────────

export function Heatmap({ result, subtitle, onSelect, onExplain }: ChartProps) {
  const opt = heatmapOption(result);
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
