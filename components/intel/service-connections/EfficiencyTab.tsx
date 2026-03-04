'use client';

import { useState, useEffect } from 'react';
import { Gauge, Clock, CheckCircle2, TrendingUp, ChevronDown, ChevronUp, Sparkles, Loader2 } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import type { EfficiencyMetrics, AIInsight } from '@/lib/service-connection-types';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'border-red-500/50 bg-red-500/5',
  warning: 'border-amber-500/50 bg-amber-500/5',
  stable: 'border-blue-500/50 bg-blue-500/5',
  positive: 'border-emerald-500/50 bg-emerald-500/5',
};

const SEVERITY_ICONS: Record<string, string> = {
  critical: 'text-red-400',
  warning: 'text-amber-400',
  stable: 'text-blue-400',
  positive: 'text-emerald-400',
};

export function EfficiencyTab() {
  const [metrics, setMetrics] = useState<EfficiencyMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiInsight, setAiInsight] = useState<AIInsight | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

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

  const loadAI = async (regenerate = false) => {
    setAiLoading(true);
    try {
      if (!regenerate) {
        const res = await fetch('/api/service-connections/analysis/deep');
        if (res.ok) {
          const data = await res.json();
          if (data.analysis) {
            setAiInsight(data.analysis);
            setAiLoading(false);
            return;
          }
        }
      }
      const res = await fetch('/api/service-connections/analysis/deep', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setAiInsight(data.analysis);
      }
    } catch { /* silent */ }
    setAiLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 text-[#d4af37] animate-spin" />
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="card-premium p-8 text-center">
        <p className="text-[#64748b]">No service connection data available yet. Upload GPL pending applications to start tracking.</p>
      </div>
    );
  }

  // Build completion time distribution histogram
  const histogramBuckets = [
    { label: '0-10d', min: 0, max: 10, color: '#059669' },
    { label: '11-20d', min: 11, max: 20, color: '#10b981' },
    { label: '21-30d', min: 21, max: 30, color: '#d4af37' },
    { label: '31-60d', min: 31, max: 60, color: '#f97316' },
    { label: '61-90d', min: 61, max: 90, color: '#dc2626' },
    { label: '90d+', min: 91, max: Infinity, color: '#991b1b' },
  ];
  // We'd need individual completion times for histogram — approximate from monthly data
  // For now, show track comparison as the main chart

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <KPICard
          icon={Clock}
          label="Avg Completion Time"
          value={`${metrics.overall.avgDays}d`}
          sub={`median ${metrics.overall.medianDays}d`}
          color="text-amber-400"
        />
        <KPICard
          icon={CheckCircle2}
          label="SLA Compliance"
          value={`${metrics.overall.slaPct}%`}
          sub={`${metrics.overall.completedCount} completed`}
          color={metrics.overall.slaPct >= 70 ? 'text-emerald-400' : metrics.overall.slaPct >= 50 ? 'text-amber-400' : 'text-red-400'}
        />
        <KPICard
          icon={TrendingUp}
          label="Monthly Throughput"
          value={metrics.monthly.length > 0 ? `${metrics.monthly[metrics.monthly.length - 1].completed}` : '0'}
          sub={`${metrics.monthly.length > 0 ? metrics.monthly[metrics.monthly.length - 1].opened : 0} opened`}
          color="text-blue-400"
        />
        <KPICard
          icon={Gauge}
          label="Queue Depth"
          value={`${metrics.totalOpen}`}
          sub={`${metrics.totalLegacy} legacy excluded`}
          color="text-purple-400"
        />
      </div>

      {/* Track A vs B Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TrackCard
          title="Track A — Fast-Track"
          subtitle="Simple meter installation"
          track={metrics.trackA}
          color="#10b981"
        />
        <TrackCard
          title="Track B — Capital Work"
          subtitle="Network extension + installation"
          track={metrics.trackB}
          color="#f59e0b"
        />
      </div>

      {/* Stage Performance Chart */}
      {metrics.stages.length > 0 && (
        <div className="card-premium p-4 md:p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Stage Duration vs SLA Target</h3>
          <div className="h-48 md:h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={metrics.stages.map(s => ({
                  name: s.stage,
                  avgDays: s.avgDays,
                  slaTarget: s.slaTarget,
                  slaPct: s.slaPct,
                }))}
                margin={{ left: 10, right: 20 }}
              >
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  label={{ value: 'Days', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{ background: '#1a2744', border: '1px solid #2d3a52', borderRadius: 8, color: '#fff' }}
                  formatter={(value: number, name: string) => [
                    `${value}d`,
                    name === 'avgDays' ? 'Avg Duration' : 'SLA Target',
                  ]}
                />
                <Bar dataKey="avgDays" name="Avg Duration" radius={[4, 4, 0, 0]} barSize={24}>
                  {metrics.stages.map((s, i) => (
                    <Cell
                      key={i}
                      fill={s.avgDays <= s.slaTarget ? '#059669' : s.avgDays <= s.slaTarget * 2 ? '#d4af37' : '#dc2626'}
                    />
                  ))}
                </Bar>
                <Bar dataKey="slaTarget" name="SLA Target" fill="#2d3a52" radius={[4, 4, 0, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 mt-3 text-[10px] text-[#64748b]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-600" /> Within SLA</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#d4af37]" /> 1-2x SLA</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-600" /> &gt;2x SLA</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#2d3a52]" /> SLA Target</span>
          </div>
        </div>
      )}

      {/* AI Analysis Section */}
      <div className="card-premium p-4 md:p-6">
        <button
          onClick={() => {
            setAiOpen(!aiOpen);
            if (!aiOpen && !aiInsight && !aiLoading) loadAI();
          }}
          className="flex items-center justify-between w-full"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#d4af37]" />
            <span className="text-sm font-semibold text-white">AI Efficiency Analysis</span>
          </div>
          {aiOpen ? <ChevronUp className="h-4 w-4 text-[#64748b]" /> : <ChevronDown className="h-4 w-4 text-[#64748b]" />}
        </button>

        {aiOpen && (
          <div className="mt-4 space-y-4">
            {aiLoading ? (
              <div className="flex items-center gap-2 py-8 justify-center">
                <Loader2 className="h-5 w-5 text-[#d4af37] animate-spin" />
                <span className="text-sm text-[#64748b]">Generating analysis...</span>
              </div>
            ) : aiInsight ? (
              <>
                <p className="text-sm text-[#94a3b8] leading-relaxed">{aiInsight.executiveSummary}</p>
                <div className="space-y-3">
                  {aiInsight.sections.map((section, i) => (
                    <div key={i} className={`rounded-lg border p-3 ${SEVERITY_COLORS[section.severity] || ''}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-bold uppercase ${SEVERITY_ICONS[section.severity] || ''}`}>
                          {section.severity}
                        </span>
                        <span className="text-sm font-medium text-white">{section.title}</span>
                      </div>
                      <p className="text-xs text-[#94a3b8] mb-1">{section.summary}</p>
                      <p className="text-xs text-[#64748b] leading-relaxed">{section.detail}</p>
                    </div>
                  ))}
                </div>
                {aiInsight.recommendations.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-white mb-2">Recommendations</h4>
                    <div className="space-y-2">
                      {aiInsight.recommendations.map((rec, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <span className={`shrink-0 px-1.5 py-0.5 rounded font-medium ${
                            rec.urgency === 'Immediate' ? 'bg-red-500/20 text-red-400'
                            : rec.urgency === 'Short-term' ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-blue-500/20 text-blue-400'
                          }`}>
                            {rec.urgency}
                          </span>
                          <span className="text-[#94a3b8]">{rec.recommendation}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <button
                  onClick={() => loadAI(true)}
                  className="text-xs text-[#d4af37] hover:text-[#f0d060]"
                >
                  Regenerate analysis
                </button>
              </>
            ) : (
              <p className="text-sm text-[#64748b]">No analysis available.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function KPICard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div className="card-premium p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-xs text-[#64748b]">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-[#64748b] mt-1">{sub}</div>
    </div>
  );
}

function TrackCard({ title, subtitle, track, color }: {
  title: string;
  subtitle: string;
  track: { completedCount: number; avgDays: number; medianDays: number; slaPct: number; slaTarget: number; openCount: number };
  color: string;
}) {
  return (
    <div className="card-premium p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <div>
          <h4 className="text-sm font-semibold text-white">{title}</h4>
          <p className="text-[10px] text-[#64748b]">{subtitle}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className="text-lg font-bold text-white">{track.completedCount}</div>
          <div className="text-[10px] text-[#64748b]">completed</div>
        </div>
        <div>
          <div className="text-lg font-bold text-white">{track.avgDays}<span className="text-xs font-normal text-[#64748b]">d</span></div>
          <div className="text-[10px] text-[#64748b]">avg (target ≤{track.slaTarget}d)</div>
        </div>
        <div>
          <div className={`text-lg font-bold ${track.slaPct >= 70 ? 'text-emerald-400' : track.slaPct >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
            {track.slaPct}%
          </div>
          <div className="text-[10px] text-[#64748b]">SLA compliance</div>
        </div>
      </div>
      <div className="mt-3 pt-2 border-t border-[#2d3a52]">
        <span className="text-xs text-[#64748b]">{track.openCount} currently open</span>
      </div>
    </div>
  );
}
