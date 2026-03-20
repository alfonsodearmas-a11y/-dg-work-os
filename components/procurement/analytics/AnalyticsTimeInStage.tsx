'use client';

import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine, LabelList,
} from 'recharts';
import type { ProcurementPackage, ProcurementStage } from '@/lib/procurement-types';
import { PROCUREMENT_STAGES, STAGE_CONFIG } from '@/lib/procurement-types';
import { CHART_TOOLTIP_STYLE, CHART_AXIS_LINE, chartResponsive } from '@/lib/chart-styles';

const TARGET_DAYS = 21;

interface Props {
  packages: ProcurementPackage[];
  isMobile?: boolean;
}

function barColor(days: number): string {
  if (days <= TARGET_DAYS) return '#10b981';                  // green — under target
  if (days <= Math.round(TARGET_DAYS * 1.5)) return '#f59e0b'; // amber — 1–1.5x
  return '#ef4444';                                           // red — over 1.5x
}

export function AnalyticsTimeInStage({ packages, isMobile = false }: Props) {
  const cr = chartResponsive(isMobile);

  const chartData = useMemo(() => {
    const buckets: Record<ProcurementStage, number[]> = {
      draft: [], submitted: [], advertised: [], evaluation: [], no_objection: [], awarded: [],
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
        stageKey: stage,
      };
    });
  }, [packages]);

  if (packages.length === 0) {
    return (
      <div className="card-premium p-5 h-full flex flex-col">
        <h3 className="text-sm font-semibold text-white mb-4">Time in Stage</h3>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-navy-600 text-sm">No data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card-premium p-5 h-full flex flex-col">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">Time in Stage</h3>
        <span className="text-[10px] text-navy-600">Target: {TARGET_DAYS}d</span>
      </div>

      <div className={isMobile ? 'h-56' : 'h-64'}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" barSize={cr.barSize(18)}>
            <XAxis
              type="number"
              tick={cr.axisTick}
              axisLine={CHART_AXIS_LINE}
              tickLine={false}
              unit="d"
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
              formatter={(value: number) => {
                const status = value <= TARGET_DAYS ? 'On target' : value <= TARGET_DAYS * 1.5 ? 'Approaching limit' : 'Over target';
                return [`${value} days — ${status}`, 'Avg duration'];
              }}
            />
            <ReferenceLine
              x={TARGET_DAYS}
              stroke="#64748b"
              strokeDasharray="4 4"
              strokeWidth={1}
              label={{
                value: `${TARGET_DAYS}d target`,
                fill: '#64748b',
                fontSize: 10,
                position: 'top',
              }}
            />
            <Bar dataKey="avgDays" radius={[0, 4, 4, 0]}>
              {chartData.map((entry) => (
                <Cell key={entry.stageKey} fill={barColor(entry.avgDays)} />
              ))}
              <LabelList
                dataKey="avgDays"
                position="right"
                fill="#e2e8f0"
                fontSize={cr.labelFontSize}
                fontWeight={500}
                formatter={(v: number) => (v > 0 ? `${v}d` : '')}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
