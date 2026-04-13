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
                itemStyle={{ color: '#f1f5f9' }}
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
      <div className="card-premium p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Agency Summary</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-navy-800">
              <th className="text-left text-gold-500 font-semibold pb-2 pr-2">Agency</th>
              <th className="text-right text-gold-500 font-semibold pb-2 px-1">Proj</th>
              <th className="text-right text-gold-500 font-semibold pb-2 px-1">Value</th>
              <th className="text-right text-gold-500 font-semibold pb-2 px-1">Compl.</th>
              <th className="text-right text-gold-500 font-semibold pb-2 pl-1">Overdue</th>
            </tr>
          </thead>
          <tbody>
            {agencies.map((a) => (
              <tr key={a.agency} className="border-b border-navy-800/40">
                <td className="py-1.5 pr-2">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-sm shrink-0"
                      style={{ backgroundColor: AGENCY_HEX_COLORS[a.agency] || '#64748b' }}
                    />
                    <span className="text-white whitespace-nowrap">{a.agency}</span>
                  </span>
                </td>
                <td className="text-right text-white tabular-nums py-1.5 px-1">{a.count}</td>
                <td className="text-right text-white tabular-nums py-1.5 px-1 whitespace-nowrap">{fmtCurrency(a.total_value / 100)}</td>
                <td className="text-right text-white tabular-nums py-1.5 px-1">{a.avg_completion}%</td>
                <td className="text-right text-slate-400 tabular-nums py-1.5 pl-1 whitespace-nowrap">
                  {a.avg_days_overdue > 0 ? `${a.avg_days_overdue}d` : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
