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
