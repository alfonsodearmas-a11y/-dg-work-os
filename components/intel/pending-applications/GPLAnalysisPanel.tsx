'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, Loader2, Brain, ChevronDown, RefreshCw } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { GPLAnalysis, DeepAnalysisResult } from '@/lib/pending-applications-types';

const STAGE_COLORS: Record<string, string> = {
  Metering: '#f59e0b',
  Designs: '#3b82f6',
  Execution: '#8b5cf6',
  Survey: '#06b6d4',
  Estimation: '#10b981',
  Approval: '#ec4899',
  Other: '#64748b',
};

const SEVERITY_CONFIG: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
  warning: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  stable: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  positive: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
};

export function GPLAnalysisPanel() {
  const [analysis, setAnalysis] = useState<GPLAnalysis | null>(null);
  const [deepAnalysis, setDeepAnalysis] = useState<DeepAnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [analysisRes, deepRes] = await Promise.all([
          fetch('/api/pending-applications/analysis?agency=GPL'),
          fetch('/api/pending-applications/analysis/deep?agency=GPL'),
        ]);
        if (analysisRes.ok) {
          const data = await analysisRes.json();
          setAnalysis(data.analysis);
        }
        if (deepRes.ok) {
          const data = await deepRes.json();
          if (data.analysis) setDeepAnalysis(data.analysis);
        }
      } catch (err) {
        setError('Failed to load analysis');
        console.error(err);
      }
      setLoading(false);
    }
    load();
  }, []);

  const generateDeepAnalysis = async () => {
    setGeneratingAI(true);
    try {
      const res = await fetch('/api/pending-applications/analysis/deep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agency: 'GPL' }),
      });
      const data = await res.json();
      if (res.ok && data.analysis) {
        setDeepAnalysis(data.analysis);
      } else {
        setError(data.error || 'AI analysis failed');
      }
    } catch {
      setError('Network error');
    }
    setGeneratingAI(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!analysis) {
    return <div className="card-premium p-8 text-center"><p className="text-[#64748b]">No GPL records found. Upload a GPL pending applications file first.</p></div>;
  }

  const agingData = analysis.agingBuckets.map(b => ({
    name: b.label,
    count: b.count,
    pct: b.pct,
  }));

  const AGING_COLORS = ['#059669', '#10b981', '#d4af37', '#f97316', '#dc2626', '#991b1b'];

  return (
    <div className="space-y-6">
      {/* Pipeline Funnel */}
      <div className="card-premium p-4 md:p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Pipeline Funnel — SLA Compliance</h3>
        <div className="space-y-3">
          {analysis.pipeline.map(stage => {
            const color = STAGE_COLORS[stage.stage] || '#64748b';
            return (
              <div key={stage.stage} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white font-medium">{stage.stage}</span>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-[#64748b]">{stage.count} orders</span>
                    <span className="text-[#64748b]">avg {stage.avgDays}d</span>
                    <span className="text-[#64748b]">SLA {stage.slaDays}d</span>
                    <span className={stage.compliancePct >= 70 ? 'text-emerald-400' : stage.compliancePct >= 40 ? 'text-amber-400' : 'text-red-400'}>
                      {stage.compliancePct}% compliant
                    </span>
                  </div>
                </div>
                <div className="relative h-6 rounded-lg bg-[#0a1628] border border-[#2d3a52] overflow-hidden">
                  {/* Full bar background (total) */}
                  <div className="absolute inset-0 rounded-lg" style={{ backgroundColor: color, opacity: 0.15 }} />
                  {/* Compliant portion */}
                  <div
                    className="absolute inset-y-0 left-0 rounded-lg"
                    style={{ width: `${stage.compliancePct}%`, backgroundColor: color, opacity: 0.7 }}
                  />
                  {/* Breached portion */}
                  <div
                    className="absolute inset-y-0 rounded-lg bg-red-500/50"
                    style={{ left: `${stage.compliancePct}%`, width: `${100 - stage.compliancePct}%` }}
                  />
                  <div className="absolute inset-0 flex items-center justify-between px-3 text-xs font-medium text-white">
                    <span>{stage.slaCompliant} OK</span>
                    {stage.slaBreached > 0 && <span className="text-red-300">{stage.slaBreached} breached</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Aging Buckets */}
      <div className="card-premium p-4 md:p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Aging Distribution</h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={agingData} margin={{ left: 0, right: 10 }}>
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#1a2744', border: '1px solid #2d3a52', borderRadius: 8, color: '#fff' }}
                formatter={(value: number, _name: string, props: { payload?: { pct: number } }) => [`${value} (${props.payload?.pct ?? 0}%)`, 'Count']}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={32}>
                {agingData.map((_entry, i) => (
                  <Cell key={i} fill={AGING_COLORS[i] || '#64748b'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Account Types */}
      {analysis.accountTypes.length > 0 && (
        <div className="card-premium p-4 md:p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Account Types</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[#64748b] text-xs uppercase tracking-wider border-b border-[#2d3a52]">
                  <th className="text-left py-2 pr-4">Type</th>
                  <th className="text-right py-2 px-3">Count</th>
                  <th className="text-right py-2 pl-3">Avg Wait</th>
                </tr>
              </thead>
              <tbody>
                {analysis.accountTypes.slice(0, 10).map(a => (
                  <tr key={a.type} className="border-b border-[#2d3a52]/50">
                    <td className="py-2.5 pr-4 text-white">{a.type}</td>
                    <td className="py-2.5 px-3 text-right text-[#94a3b8]">{a.count}</td>
                    <td className="py-2.5 pl-3 text-right text-[#94a3b8]">{a.avgDays}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Red Flags */}
      {analysis.redFlags.length > 0 && (
        <div className="card-premium p-4 md:p-6">
          <h3 className="text-sm font-semibold text-red-400 mb-3">Red Flags</h3>
          <div className="space-y-2">
            {analysis.redFlags.map((flag, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <span className="text-[#94a3b8]">{flag}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Deep Analysis */}
      <div className="card-premium p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-[#d4af37]" />
            <h3 className="text-sm font-semibold text-white">AI Deep Analysis</h3>
          </div>
          <button
            onClick={generateDeepAnalysis}
            disabled={generatingAI}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1a2744] border border-[#2d3a52] hover:border-[#d4af37] text-[#94a3b8] hover:text-white disabled:opacity-50 transition-colors"
          >
            {generatingAI ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {deepAnalysis ? 'Regenerate' : 'Generate'}
          </button>
        </div>

        {generatingAI && (
          <div className="flex items-center justify-center gap-3 py-8">
            <Loader2 className="h-5 w-5 animate-spin text-[#d4af37]" />
            <span className="text-sm text-[#64748b]">Generating AI analysis...</span>
          </div>
        )}

        {!generatingAI && deepAnalysis && (
          <div className="space-y-4">
            <p className="text-sm text-[#94a3b8] leading-relaxed">{deepAnalysis.executiveSummary}</p>

            {deepAnalysis.sections?.map((section, i) => {
              const sev = SEVERITY_CONFIG[section.severity] || SEVERITY_CONFIG.stable;
              return <BriefingSection key={i} section={section} sev={sev} />;
            })}

            {deepAnalysis.recommendations && deepAnalysis.recommendations.length > 0 && (
              <div className="mt-4">
                <h4 className="text-xs text-[#64748b] uppercase tracking-wider font-semibold mb-2">Recommendations</h4>
                <div className="space-y-2">
                  {deepAnalysis.recommendations.map((rec, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-[#0a1628] border border-[#2d3a52]">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                        rec.urgency === 'Immediate' ? 'bg-red-500/20 text-red-400' :
                        rec.urgency === 'Short-term' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-blue-500/20 text-blue-400'
                      }`}>{rec.urgency}</span>
                      <div>
                        <p className="text-sm text-white">{rec.recommendation}</p>
                        <p className="text-xs text-[#64748b] mt-0.5">{rec.category}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-[#64748b]">
              Generated {deepAnalysis.createdAt ? new Date(deepAnalysis.createdAt).toLocaleString() : 'just now'}
            </p>
          </div>
        )}

        {!generatingAI && !deepAnalysis && (
          <p className="text-sm text-[#64748b] py-4">Click Generate to create an AI-powered deep analysis of GPL pending applications.</p>
        )}

        {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
      </div>
    </div>
  );
}

function BriefingSection({ section, sev }: { section: { title: string; severity: string; summary: string; detail: string }; sev: { bg: string; text: string; border: string } }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`rounded-xl border ${sev.border} overflow-hidden`}>
      <button type="button" onClick={() => setExpanded(!expanded)} className="w-full text-left px-4 py-3 hover:bg-white/[0.02] transition-colors">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-semibold text-white">{section.title}</span>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${sev.bg} ${sev.text}`}>{section.severity}</span>
            <ChevronDown className={`w-4 h-4 text-[#64748b] transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </div>
        </div>
        <p className="text-sm text-[#94a3b8]">{section.summary}</p>
      </button>
      {expanded && (
        <div className="px-4 pb-4">
          <div className="bg-[#0a1628] rounded-lg p-3 border border-[#2d3a52]">
            <p className="text-sm text-[#94a3b8] leading-relaxed">{section.detail}</p>
          </div>
        </div>
      )}
    </div>
  );
}
