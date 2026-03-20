/** Shared Recharts styling constants for the dark navy theme. */

export const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '8px',
    fontSize: '14px',
  },
  labelStyle: { color: '#f1f5f9' },
  cursor: { fill: 'rgba(212,175,55,0.05)' },
} as const;

export const CHART_AXIS_TICK = { fill: '#64748b', fontSize: 12 } as const;

export const CHART_AXIS_LINE = { stroke: '#2d3a52' } as const;

export const CHART_GRID_STROKE = '#2d3a52';

/** Mobile-responsive chart sizing. Pass `isMobile` from a parent hook call. */
export function chartResponsive(isMobile: boolean) {
  return {
    heightClass: isMobile ? 'h-64' : 'h-72',
    axisTick: { ...CHART_AXIS_TICK, fontSize: isMobile ? 10 : 12 },
    yAxisWidth: isMobile ? 72 : 100,
    barSize: (desktop: number) => (isMobile ? Math.round(desktop * 0.75) : desktop),
    labelFontSize: isMobile ? 9 : 11,
  };
}
