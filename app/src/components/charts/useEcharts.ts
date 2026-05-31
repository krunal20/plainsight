import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import { registerPlainsightTheme, PLAINSIGHT_THEME } from '../../theme/echartsTheme';

// Register the theme once (idempotent — echarts ignores duplicate registrations)
registerPlainsightTheme();

/**
 * Mounts an ECharts instance into a container ref, applies `option`, handles
 * window resize, and disposes on unmount.
 */
export function useEcharts(option: EChartsOption | null) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Init (or reuse existing instance)
    if (!chartRef.current) {
      chartRef.current = echarts.init(container, PLAINSIGHT_THEME, {
        renderer: 'canvas',
      });
    }

    if (option) {
      chartRef.current.setOption(option, { notMerge: true });
    }

    const handleResize = () => chartRef.current?.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [option]);

  // Dispose on unmount
  useEffect(() => {
    return () => {
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  return containerRef;
}
