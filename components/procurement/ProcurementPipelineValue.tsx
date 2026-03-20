'use client';

import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import { fmtCurrency } from '@/lib/format';
import { PROCUREMENT_STAGES, STAGE_CONFIG } from '@/lib/procurement-types';
import type { PipelineStats, ProcurementStage } from '@/lib/procurement-types';
import { CHART_TOOLTIP_STYLE, CHART_AXIS_LINE, CHART_GRID_STROKE, chartResponsive } from '@/lib/chart-styles';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProcurementPipelineValueProps {
  stats: PipelineStats;
  isMobile?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProcurementPipelineValue({ stats, isMobile = false }: ProcurementPipelineValueProps) {
  const cr = chartResponsive(isMobile);
  const { chartData, totalValue } = useMemo(() => {
    const data = PROCUREMENT_STAGES.map((stage: ProcurementStage) => ({
      stage: STAGE_CONFIG[stage].label,
      value: stats.by_stage[stage].total_value,
      color: STAGE_CONFIG[stage].color,
      stageKey: stage,
    }));

    const total = PROCUREMENT_STAGES.reduce(
      (sum, stage) => sum + stats.by_stage[stage].total_value,
      0,
    );

    return { chartData: data, totalValue: total };
  }, [stats]);

  return (
    <div className="card-premium p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Pipeline value by stage</h3>
      <div className={cr.heightClass}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" barSize={cr.barSize(24)}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} horizontal={false} />
            <XAxis
              type="number"
              tick={cr.axisTick}
              axisLine={CHART_AXIS_LINE}
              tickLine={CHART_AXIS_LINE}
              tickFormatter={(v: number) => fmtCurrency(v)}
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
              formatter={(value: number) => [fmtCurrency(value), 'Total value']}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {chartData.map((entry) => (
                <Cell key={entry.stageKey} fill={entry.color} />
              ))}
              <LabelList
                dataKey="value"
                position="right"
                fill="#94a3b8"
                fontSize={cr.labelFontSize}
                formatter={(value: number) => (value > 0 ? fmtCurrency(value) : '')}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 pt-4 border-t border-navy-800">
        <p className="text-navy-600 text-sm">Total pipeline value</p>
        <p className="text-2xl font-bold text-white">{fmtCurrency(totalValue)}</p>
      </div>
    </div>
  );
}
