'use client';

import { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import type { Snapshot } from '@/lib/pending-applications-types';

interface TrendChartsProps {
  refreshKey?: number;
}

export function TrendCharts({ refreshKey }: TrendChartsProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/pending-applications/trends?limit=30');
        if (res.ok) {
          const data = await res.json();
          setSnapshots(data.snapshots || []);
        }
      } catch { /* silent */ }
      setLoading(false);
    }
    load();
  }, [refreshKey]);

  if (loading) return null;
  if (snapshots.length < 2) return null;

  // Build chart data: merge GPL and GWI snapshots by date
  const dateMap = new Map<string, { date: string; GPL?: number; GWI?: number }>();
  for (const s of snapshots) {
    const entry = dateMap.get(s.snapshotDate) || { date: s.snapshotDate };
    entry[s.agency] = s.totalCount;
    dateMap.set(s.snapshotDate, entry);
  }
  const chartData = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  const hasGPL = chartData.some(d => d.GPL !== undefined);
  const hasGWI = chartData.some(d => d.GWI !== undefined);

  if (chartData.length < 2) return null;

  return (
    <div className="card-premium p-4 md:p-6">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="h-4 w-4 text-[#d4af37]" />
        <h3 className="text-sm font-semibold text-white">Pending Applications Trend</h3>
      </div>
      <div className="h-48 md:h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ left: 0, right: 10 }}>
            <XAxis
              dataKey="date"
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(d: string) => {
                const date = new Date(d + 'T00:00:00');
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              }}
            />
            <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: '#1a2744', border: '1px solid #2d3a52', borderRadius: 8, color: '#fff' }}
              labelFormatter={(d: string) => {
                const date = new Date(d + 'T00:00:00');
                return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
            {hasGPL && <Line type="monotone" dataKey="GPL" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b', r: 3 }} activeDot={{ r: 5 }} />}
            {hasGWI && <Line type="monotone" dataKey="GWI" stroke="#06b6d4" strokeWidth={2} dot={{ fill: '#06b6d4', r: 3 }} activeDot={{ r: 5 }} />}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
