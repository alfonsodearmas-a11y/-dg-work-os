'use client';

import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import { CHART_TOOLTIP_STYLE, CHART_AXIS_LINE, chartResponsive } from '@/lib/chart-styles';
import { AGENCY_HEX_COLORS } from '@/lib/constants/agencies';
import type { AgencyBreakdown } from '@/lib/delayed-projects/types';
import { fmtCurrency } from '@/components/oversight/types';

interface AgencyBreakdownChartProps {
  agencies: AgencyBreakdown[];
  isMobile: boolean;
}

export function AgencyBreakdownChart({ agencies, isMobile }: AgencyBreakdownChartProps) {
  const resp = useMemo(() => chartResponsive(isMobile), [isMobile]);

  const chartData = useMemo(() =>
    agencies.map((a) => ({
      name: a.agency,
      completion: a.avg_completion,
      remaining: 100 - a.avg_completion,
      fill: AGENCY_HEX_COLORS[a.agency] || '#64748b',
      count: a.count,
      value: a.total_value,
    })),
  [agencies]);

  if (agencies.length === 0) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
      {/* Chart */}
      <div className="card-premium p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Agency Completion</h3>
        <div className={resp.heightClass}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_AXIS_LINE.stroke} horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={resp.axisTick} stroke={CHART_AXIS_LINE.stroke} />
              <YAxis
                type="category"
                dataKey="name"
                tick={resp.axisTick}
                stroke={CHART_AXIS_LINE.stroke}
                width={50}
              />
              <Tooltip
                {...CHART_TOOLTIP_STYLE}
                formatter={(value: number, name: string) => [
                  `${value.toFixed(1)}%`,
                  name === 'completion' ? 'Completed' : 'Remaining',
                ]}
              />
              <Bar dataKey="completion" stackId="a" radius={[0, 0, 0, 0]} barSize={resp.barSize(20)}>
                {chartData.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
                <LabelList dataKey="completion" position="right" fill="#94a3b8" fontSize={resp.labelFontSize} formatter={(v: number) => `${v.toFixed(0)}%`} />
              </Bar>
              <Bar dataKey="remaining" stackId="a" fill="#1a2744" radius={[0, 4, 4, 0]} barSize={resp.barSize(20)} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Table */}
      <div className="card-premium p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Agency Summary</h3>
        <div className="overflow-x-auto">
          <table className="table-premium w-full text-sm">
            <thead>
              <tr>
                <th className="text-left">Agency</th>
                <th className="text-right"># Projects</th>
                <th className="text-right">Total Value</th>
                <th className="text-right">Avg Completion</th>
                <th className="text-right">Avg Overdue</th>
              </tr>
            </thead>
            <tbody>
              {agencies.map((a) => (
                <tr key={a.agency}>
                  <td>
                    <span className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: AGENCY_HEX_COLORS[a.agency] || '#64748b' }}
                      />
                      <span className="text-white">{a.agency}</span>
                    </span>
                  </td>
                  <td className="text-right text-white tabular-nums">{a.count}</td>
                  <td className="text-right text-white tabular-nums">{fmtCurrency(a.total_value / 100)}</td>
                  <td className="text-right text-white tabular-nums">{a.avg_completion}%</td>
                  <td className="text-right text-slate-400 tabular-nums">
                    {a.avg_days_overdue > 0 ? `${a.avg_days_overdue}d` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
