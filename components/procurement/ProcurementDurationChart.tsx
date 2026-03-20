'use client';

import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine, LabelList,
} from 'recharts';
import type { ProcurementPackage, ProcurementStage } from '@/lib/procurement-types';
import { PROCUREMENT_STAGES, STAGE_CONFIG } from '@/lib/procurement-types';
import { CHART_TOOLTIP_STYLE, CHART_AXIS_LINE, CHART_GRID_STROKE, chartResponsive } from '@/lib/chart-styles';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProcurementDurationChartProps {
  packages: ProcurementPackage[];
  isMobile?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Brighten a hex color by blending toward white. Factor 0..1 */
function brighten(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const blend = (c: number) => Math.min(255, Math.round(c + (255 - c) * factor));
  return `#${blend(r).toString(16).padStart(2, '0')}${blend(g).toString(16).padStart(2, '0')}${blend(b).toString(16).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProcurementDurationChart({ packages, isMobile = false }: ProcurementDurationChartProps) {
  const cr = chartResponsive(isMobile);
  const chartData = useMemo(() => {
    // Group packages by stage, compute average days_at_current_stage
    const buckets: Record<ProcurementStage, number[]> = {
      pre_advertisement: [],
      advertised: [],
      evaluation: [],
      no_objection: [],
      awarded: [],
    };

    for (const pkg of packages) {
      buckets[pkg.current_stage].push(pkg.days_at_current_stage);
    }

    return PROCUREMENT_STAGES.map((stage) => {
      const values = buckets[stage];
      const avg = values.length > 0
        ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
        : 0;
      return {
        stage: STAGE_CONFIG[stage].label,
        avgDays: avg,
        color: STAGE_CONFIG[stage].color,
        stageKey: stage,
      };
    });
  }, [packages]);

  if (packages.length === 0) {
    return (
      <div className="card-premium p-6">
        <h3 className="text-lg font-semibold text-white mb-4">How long is it taking?</h3>
        <p className="text-navy-600 text-sm text-center py-8">No data</p>
      </div>
    );
  }

  return (
    <div className="card-premium p-6">
      <h3 className="text-lg font-semibold text-white mb-4">How long is it taking?</h3>
      <div className={cr.heightClass}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" barSize={cr.barSize(20)}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} horizontal={false} />
            <XAxis
              type="number"
              tick={cr.axisTick}
              axisLine={CHART_AXIS_LINE}
              tickLine={CHART_AXIS_LINE}
              unit="d"
            />
            <YAxis
              type="category"
              dataKey="stage"
              width={cr.yAxisWidth}
              tick={cr.axisTick}
              axisLine={CHART_AXIS_LINE}
              tickLine={CHART_AXIS_LINE}
            />
            <Tooltip
              {...CHART_TOOLTIP_STYLE}
              formatter={(value: number) => [`${value} days`, 'Avg. duration']}
            />
            <ReferenceLine
              x={14}
              stroke="#d4af37"
              strokeDasharray="4 4"
              label={{ value: '14d', fill: '#d4af37', fontSize: 11, position: 'top' }}
            />
            <ReferenceLine
              x={30}
              stroke="#dc2626"
              strokeDasharray="4 4"
              label={{ value: '30d', fill: '#dc2626', fontSize: 11, position: 'top' }}
            />
            <Bar dataKey="avgDays" radius={[0, 4, 4, 0]}>
              {chartData.map((entry) => (
                <Cell
                  key={entry.stageKey}
                  fill={entry.avgDays > 30 ? brighten(entry.color, 0.3) : entry.color}
                  stroke={entry.avgDays > 30 ? '#dc2626' : 'none'}
                  strokeWidth={entry.avgDays > 30 ? 1.5 : 0}
                />
              ))}
              <LabelList
                dataKey="avgDays"
                position="right"
                fill="#94a3b8"
                fontSize={12}
                formatter={(value: number) => (value > 0 ? `${value}d` : '')}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
