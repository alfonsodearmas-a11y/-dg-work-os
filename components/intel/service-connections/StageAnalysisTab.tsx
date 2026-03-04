'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import type { EfficiencyMetrics, StageMetrics } from '@/lib/service-connection-types';

function stageColor(stage: StageMetrics): string {
  if (stage.avgDays <= stage.slaTarget) return '#059669';
  if (stage.avgDays <= stage.slaTarget * 2) return '#d4af37';
  return '#dc2626';
}

export function StageAnalysisTab() {
  const [metrics, setMetrics] = useState<EfficiencyMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'count' | 'avgDays' | 'slaPct'>('count');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/service-connections/stats');
        if (res.ok) setMetrics(await res.json());
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

  if (!metrics || metrics.stages.length === 0) {
    return (
      <div className="card-premium p-8 text-center">
        <p className="text-[#64748b]">No stage data available yet.</p>
      </div>
    );
  }

  const stages = [...metrics.stages].sort((a, b) => {
    if (sortBy === 'avgDays') return b.avgDays - a.avgDays;
    if (sortBy === 'slaPct') return a.slaPct - b.slaPct;
    return b.count - a.count;
  });

  // Track B pipeline visualization data (horizontal bars)
  const pipelineData = stages.map(s => ({
    name: s.stage,
    avgDays: s.avgDays,
    slaTarget: s.slaTarget,
    slaPct: s.slaPct,
    maxDays: s.maxDays,
    count: s.count,
  }));

  return (
    <div className="space-y-6">
      {/* Pipeline Visualization */}
      <div className="card-premium p-4 md:p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Pipeline Stage Duration (Avg Days vs SLA Target)</h3>
        <div className="h-56 md:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={pipelineData}
              layout="vertical"
              margin={{ left: 10, right: 30 }}
            >
              <XAxis
                type="number"
                tick={{ fill: '#64748b', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                label={{ value: 'Days', position: 'bottom', fill: '#64748b', fontSize: 11 }}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: '#94a3b8', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={90}
              />
              <Tooltip
                contentStyle={{ background: '#1a2744', border: '1px solid #2d3a52', borderRadius: 8, color: '#fff' }}
                formatter={(value: number, name: string) => [
                  `${value}d`,
                  name === 'avgDays' ? 'Avg Duration' : 'SLA Target',
                ]}
              />
              <Bar dataKey="slaTarget" name="SLA Target" fill="#2d3a52" radius={[0, 4, 4, 0]} barSize={14} />
              <Bar dataKey="avgDays" name="Avg Duration" radius={[0, 4, 4, 0]} barSize={14}>
                {pipelineData.map((entry, i) => (
                  <Cell key={i} fill={stageColor(stages[i])} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-4 mt-3 text-[10px] text-[#64748b]">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-600" /> ≤ SLA</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#d4af37]" /> 1-2x SLA</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-600" /> &gt;2x SLA</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#2d3a52]" /> SLA Target</span>
        </div>
      </div>

      {/* Stage Breakdown Table */}
      <div className="card-premium p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Stage Breakdown</h3>
          <div className="flex items-center gap-1 text-[10px]">
            <span className="text-[#64748b]">Sort:</span>
            {(['count', 'avgDays', 'slaPct'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`px-2 py-1 rounded ${sortBy === s ? 'bg-[#d4af37]/20 text-[#d4af37]' : 'text-[#64748b] hover:text-white'}`}
              >
                {s === 'count' ? 'Volume' : s === 'avgDays' ? 'Duration' : 'SLA'}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2d3a52]">
                <th className="text-left py-2 text-[#64748b] font-medium text-xs">Stage</th>
                <th className="text-right py-2 text-[#64748b] font-medium text-xs">Orders</th>
                <th className="text-right py-2 text-[#64748b] font-medium text-xs">Avg Days</th>
                <th className="text-right py-2 text-[#64748b] font-medium text-xs">Median</th>
                <th className="text-right py-2 text-[#64748b] font-medium text-xs">Max</th>
                <th className="text-right py-2 text-[#64748b] font-medium text-xs">SLA Target</th>
                <th className="text-right py-2 text-[#64748b] font-medium text-xs">SLA %</th>
              </tr>
            </thead>
            <tbody>
              {stages.map(s => (
                <tr key={s.stage} className="border-b border-[#2d3a52]/50 hover:bg-[#1a2744]/50">
                  <td className="py-2.5 font-medium text-white">{s.stage}</td>
                  <td className="py-2.5 text-right text-[#94a3b8]">{s.count}</td>
                  <td className="py-2.5 text-right">
                    <span className={s.avgDays <= s.slaTarget ? 'text-emerald-400' : s.avgDays <= s.slaTarget * 2 ? 'text-amber-400' : 'text-red-400'}>
                      {s.avgDays}d
                    </span>
                  </td>
                  <td className="py-2.5 text-right text-[#94a3b8]">{s.medianDays}d</td>
                  <td className="py-2.5 text-right text-[#94a3b8]">{s.maxDays}d</td>
                  <td className="py-2.5 text-right text-[#64748b]">{s.slaTarget}d</td>
                  <td className="py-2.5 text-right">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                      s.slaPct >= 70 ? 'bg-emerald-500/20 text-emerald-400'
                      : s.slaPct >= 50 ? 'bg-amber-500/20 text-amber-400'
                      : 'bg-red-500/20 text-red-400'
                    }`}>
                      {s.slaPct}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Regional Distribution */}
      {metrics.regions.length > 0 && (
        <div className="card-premium p-4 md:p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Regional Distribution</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2d3a52]">
                  <th className="text-left py-2 text-[#64748b] font-medium text-xs">Region</th>
                  <th className="text-right py-2 text-[#64748b] font-medium text-xs">Open</th>
                  <th className="text-right py-2 text-[#64748b] font-medium text-xs">Completed</th>
                  <th className="text-right py-2 text-[#64748b] font-medium text-xs">Avg Days</th>
                </tr>
              </thead>
              <tbody>
                {metrics.regions.slice(0, 15).map(r => (
                  <tr key={r.region} className="border-b border-[#2d3a52]/50 hover:bg-[#1a2744]/50">
                    <td className="py-2 text-white">{r.region}</td>
                    <td className="py-2 text-right text-[#94a3b8]">{r.openCount}</td>
                    <td className="py-2 text-right text-[#94a3b8]">{r.completedCount}</td>
                    <td className="py-2 text-right text-[#94a3b8]">{r.avgDays}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
