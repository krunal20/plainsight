import * as echarts from 'echarts';
import { tokens } from './tokens';

export const PLAINSIGHT_THEME = 'plainsight';

const themeObj = {
  color: tokens.series,
  backgroundColor: tokens.paper,
  textStyle: {
    fontFamily: tokens.fontSans,
    color: tokens.ink,
  },
  title: {
    textStyle: {
      fontFamily: tokens.fontSans,
      color: tokens.ink,
    },
  },
  tooltip: {
    backgroundColor: tokens.card,
    borderColor: tokens.line,
    borderWidth: 1,
    textStyle: {
      color: tokens.ink,
      fontFamily: tokens.fontSans,
    },
  },
  legend: {
    textStyle: {
      color: tokens.ink,
      fontFamily: tokens.fontSans,
    },
  },
  line: {
    itemStyle: {
      borderWidth: 2,
    },
    lineStyle: {
      width: 2,
    },
    symbolSize: 6,
    symbol: 'circle',
    smooth: false,
  },
  bar: {
    itemStyle: {
      barBorderRadius: 0,
    },
  },
  pie: {
    itemStyle: {
      borderColor: tokens.paper,
      borderWidth: 2,
    },
  },
  categoryAxis: {
    axisLine: {
      show: true,
      lineStyle: {
        color: tokens.line,
        width: 1,
      },
    },
    axisTick: {
      show: false,
    },
    axisLabel: {
      color: tokens.muted,
      fontFamily: tokens.fontSans,
    },
    splitLine: {
      show: false,
    },
  },
  valueAxis: {
    axisLine: {
      show: false,
    },
    axisTick: {
      show: false,
    },
    axisLabel: {
      color: tokens.muted,
      fontFamily: tokens.fontSans,
    },
    splitLine: {
      show: true,
      lineStyle: {
        color: tokens.line,
        width: 1,
        type: 'solid' as const,
      },
    },
  },
  logAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: {
      color: tokens.muted,
      fontFamily: tokens.fontSans,
    },
    splitLine: {
      show: true,
      lineStyle: {
        color: tokens.line,
        width: 1,
        type: 'solid' as const,
      },
    },
  },
  timeAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: {
      color: tokens.muted,
      fontFamily: tokens.fontSans,
    },
    splitLine: {
      show: true,
      lineStyle: {
        color: tokens.line,
        width: 1,
        type: 'solid' as const,
      },
    },
  },
};

export function registerPlainsightTheme(): void {
  echarts.registerTheme(PLAINSIGHT_THEME, themeObj);
}
