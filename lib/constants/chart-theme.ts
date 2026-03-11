/** Centralized chart theme constants for Recharts components */
export const CHART_THEME = {
  tooltip: {
    background: '#1a2744',
    border: '1px solid #2d3a52',
    borderRadius: 8,
    color: '#fff',
    fontSize: 12,
  },
  tooltipSmall: {
    background: '#1a2744',
    border: '1px solid #2d3a52',
    borderRadius: 8,
    color: '#fff',
    fontSize: 11,
  },
  grid: {
    stroke: '#2d3a52',
  },
  axis: {
    fill: '#64748b',
    fontSize: 11,
  },
  colors: {
    navy950: '#0a1628',
    navy900: '#1a2744',
    navy800: '#2d3a52',
    navy600: '#64748b',
    gold500: '#d4af37',
    slate400: '#94a3b8',
  },
} as const;
