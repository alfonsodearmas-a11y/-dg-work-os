'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
  ComposedChart,
} from 'recharts';
import type { MonthlyVolume } from '@/lib/service-connection-types';

export function MonthlyTrendsTab() {
  const [data, setData] = useState<MonthlyVolume[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/service-connections/trends?months=12');
        if (res.ok) {
          const json = await res.json();
          setData(json.months || []);
        }
      } catch { /* silent */ }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 text-[#d4af37] animate-spin" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="card-premium p-8 text-center">
        <p className="text-[#64748b]">No monthly trend data available yet. Data will appear after multiple uploads.</p>
      </div>
    );
  }

  const chartData = data.map(m => ({
    ...m,
    label: formatMonth(m.month),
  }));

  return (
    <div className="space-y-6">
      {/* Opened vs Completed + Queue Depth */}
      <div className="card-premium p-4 md:p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Monthly Volume: Opened vs Completed</h3>
        <div className="h-56 md:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ left: 0, right: 10 }}>
              <XAxis
                dataKey="label"
                tick={{ fill: '#64748b', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="left"
                tick={{ fill: '#64748b', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fill: '#64748b', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{ background: '#1a2744', border: '1px solid #2d3a52', borderRadius: 8, color: '#fff' }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
              <Bar yAxisId="left" dataKey="opened" name="Opened" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={16} />
              <Bar yAxisId="left" dataKey="completed" name="Completed" fill="#059669" radius={[4, 4, 0, 0]} barSize={16} />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="queueDepth"
                name="Queue Depth"
                stroke="#d4af37"
                strokeWidth={2}
                dot={{ fill: '#d4af37', r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Avg Completion Time + SLA lines */}
      <div className="card-premium p-4 md:p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Average Completion Time (Days)</h3>
        <div className="h-48 md:h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData.filter(d => d.avgDaysToComplete !== null)} margin={{ left: 0, right: 10 }}>
              <XAxis
                dataKey="label"
                tick={{ fill: '#64748b', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#64748b', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{ background: '#1a2744', border: '1px solid #2d3a52', borderRadius: 8, color: '#fff' }}
                formatter={(value: number, name: string) => [`${value}d`, name]}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
              <Line
                type="monotone"
                dataKey="avgDaysToComplete"
                name="Avg Days"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ fill: '#f59e0b', r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly Summary Table */}
      <div className="card-premium p-4 md:p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Monthly Summary</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2d3a52]">
                <th className="text-left py-2 text-[#64748b] font-medium text-xs">Month</th>
                <th className="text-right py-2 text-[#64748b] font-medium text-xs">Opened</th>
                <th className="text-right py-2 text-[#64748b] font-medium text-xs">Completed</th>
                <th className="text-right py-2 text-[#64748b] font-medium text-xs">Net</th>
                <th className="text-right py-2 text-[#64748b] font-medium text-xs">Queue</th>
                <th className="text-right py-2 text-[#64748b] font-medium text-xs">Avg Days</th>
                <th className="text-right py-2 text-[#64748b] font-medium text-xs">Track A SLA</th>
                <th className="text-right py-2 text-[#64748b] font-medium text-xs">Track B SLA</th>
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map(m => (
                <tr key={m.month} className="border-b border-[#2d3a52]/50 hover:bg-[#1a2744]/50">
                  <td className="py-2 text-white">{formatMonth(m.month)}</td>
                  <td className="py-2 text-right text-blue-400">{m.opened}</td>
                  <td className="py-2 text-right text-emerald-400">{m.completed}</td>
                  <td className={`py-2 text-right ${m.netChange > 0 ? 'text-red-400' : m.netChange < 0 ? 'text-emerald-400' : 'text-[#64748b]'}`}>
                    {m.netChange > 0 ? '+' : ''}{m.netChange}
                  </td>
                  <td className="py-2 text-right text-[#94a3b8]">{m.queueDepth}</td>
                  <td className="py-2 text-right text-[#94a3b8]">{m.avgDaysToComplete !== null ? `${m.avgDaysToComplete}d` : '—'}</td>
                  <td className="py-2 text-right">
                    {m.trackASla !== null ? (
                      <span className={m.trackASla >= 70 ? 'text-emerald-400' : 'text-amber-400'}>{m.trackASla}%</span>
                    ) : '—'}
                  </td>
                  <td className="py-2 text-right">
                    {m.trackBSla !== null ? (
                      <span className={m.trackBSla >= 70 ? 'text-emerald-400' : 'text-amber-400'}>{m.trackBSla}%</span>
                    ) : '—'}
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

function formatMonth(month: string): string {
  const [year, m] = month.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(m, 10) - 1]} ${year}`;
}
