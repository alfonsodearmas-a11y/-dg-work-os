'use client';

import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import { PROCUREMENT_STAGES, STAGE_CONFIG } from '@/lib/procurement-types';
import type { PipelineStats } from '@/lib/procurement-types';
import { CHART_TOOLTIP_STYLE, CHART_AXIS_LINE, chartResponsive } from '@/lib/chart-styles';

// Stage gradient: navy → gold → green
const FUNNEL_COLORS = [
  '#94a3b8', // pre_advertisement — slate
  '#60a5fa', // advertised — blue
  '#d4af37', // evaluation — gold
  '#34d399', // no_objection — emerald
  '#10b981', // awarded — green
];

interface Props {
  stats: PipelineStats | null;
  isMobile?: boolean;
}

export function AnalyticsPipelineFunnel({ stats, isMobile = false }: Props) {
  const cr = chartResponsive(isMobile);

  const { chartData, totalPackages } = useMemo(() => {
    if (!stats) return { chartData: [], totalPackages: 0 };
    const data = PROCUREMENT_STAGES.map((stage, i) => ({
      stage: STAGE_CONFIG[stage].label,
      count: stats.by_stage[stage].count,
      color: FUNNEL_COLORS[i],
      stageKey: stage,
    }));
    return { chartData: data, totalPackages: data.reduce((sum, d) => sum + d.count, 0) };
  }, [stats]);

  if (!stats || totalPackages === 0) {
    return (
      <div className="card-premium p-5 h-full flex flex-col">
        <h3 className="text-sm font-semibold text-white mb-4">Pipeline Shape</h3>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-navy-600 text-sm">No data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card-premium p-5 h-full flex flex-col">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">Pipeline Shape</h3>
        <span className="text-xs text-navy-600">{totalPackages} total tenders</span>
      </div>

      <div className={isMobile ? 'h-56' : 'h-64'}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" barSize={cr.barSize(28)} barCategoryGap="18%">
            <XAxis
              type="number"
              tick={cr.axisTick}
              axisLine={CHART_AXIS_LINE}
              tickLine={false}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="stage"
              width={cr.yAxisWidth}
              tick={{ ...cr.axisTick, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              {...CHART_TOOLTIP_STYLE}
              formatter={(value: number) => [
                `${value} tenders`,
                'Count',
              ]}
            />
            <Bar dataKey="count" radius={[0, 6, 6, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={entry.stageKey} fill={FUNNEL_COLORS[i]} />
              ))}
              <LabelList
                dataKey="count"
                position="right"
                fill="#e2e8f0"
                fontSize={cr.labelFontSize + 1}
                fontWeight={600}
                formatter={(v: number) => (v > 0 ? v : '')}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
}
