'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { useIsMobile } from '@/hooks/useIsMobile';
import {
  Shield, FileCheck, AlertTriangle, Clock, Upload, RefreshCw,
  Loader2, BarChart3, Plane,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { InsightCard, type InsightCardData } from '@/components/ui/InsightCard';
import { HealthScoreTooltip } from '@/components/ui/HealthScoreTooltip';
import { HealthBreakdownSection } from '@/components/ui/HealthBreakdownSection';
import { ProgressBar } from './common';
import { computeGCAAHealth } from '@/lib/agency-health';
import type { GCAAData } from '@/data/mockData';

// ── Types ───────────────────────────────────────────────────────────────────

interface GCAAInsights {
  overall?: {
    health_score?: number;
    headline?: string;
    summary?: string;
  };
  compliance?: { cards?: InsightCardData[] };
  inspections?: { cards?: InsightCardData[] };
  registrations?: { cards?: InsightCardData[] };
  safety?: { cards?: InsightCardData[] };
  cross_cutting?: {
    issues: string[];
    opportunities: string[];
  };
}

// Extend the base GCAAData with fields used by this detail component
interface GCAADetailData extends GCAAData {
  incidentReports?: number;
  renewalsPending?: number;
  inspectionTrend?: { week: string; completed: number }[];
}

export interface GCAADetailProps {
  data?: GCAADetailData;
}

// ── KPI Card ─────────────────────────────────────────────────────────────────

function KPICard({ title, value, unit, subtitle, status = 'neutral', children }: {
  title: string;
  value: number | string;
  unit?: string;
  subtitle?: string;
  status?: 'good' | 'warning' | 'critical' | 'neutral';
  children?: React.ReactNode;
}) {
  const valueColor = {
    good: 'text-emerald-400',
    warning: 'text-amber-400',
    critical: 'text-red-400',
    neutral: 'text-[#d4af37]',
  }[status];

  return (
    <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] p-3 md:p-5">
      <p className="text-[#94a3b8] text-sm mb-2">{title}</p>
      <div className="flex items-end gap-2 mb-1">
        <span className={`text-2xl md:text-3xl font-bold ${valueColor}`}>{value}</span>
        {unit && <span className="text-[#94a3b8] text-base md:text-lg mb-1">{unit}</span>}
      </div>
      {subtitle && <p className="text-[#64748b] text-sm">{subtitle}</p>}
      {children}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export function GCAADetail({ data }: GCAADetailProps) {
  // State
  const [activeTab, setActiveTab] = useState('compliance');
  const [insights, setInsights] = useState<GCAAInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [regenerating, setRegenerating] = useState(false);

  // Fetch insights
  useEffect(() => {
    async function fetchInsights() {
      setInsightsLoading(true);
      try {
        const url = selectedMonth
          ? `/api/gcaa/insights/${selectedMonth}`
          : '/api/gcaa/insights/latest';
        const res = await fetch(url);
        const json = await res.json();
        if (json.success && json.data) {
          setInsights(json.data);
        } else {
          setInsights(null);
        }
      } catch (err) {
        console.error('Failed to fetch GCAA insights:', err);
      } finally {
        setInsightsLoading(false);
      }
    }
    fetchInsights();
  }, [selectedMonth]);

  // Regenerate AI insights
  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const month = selectedMonth || new Date().toISOString().slice(0, 7);
      const res = await fetch('/api/gcaa/insights/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, forceRegenerate: true }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setInsights(json.data);
      }
    } catch (err) {
      console.error('Failed to regenerate insights:', err);
    } finally {
      setRegenerating(false);
    }
  };

  // Health score from mock data
  const health = useMemo(() => data ? computeGCAAHealth(data) : null, [data]);

  const tabs = [
    { id: 'compliance', label: 'Compliance' },
    { id: 'inspections', label: 'Inspections' },
    { id: 'registrations', label: 'Registrations' },
    { id: 'safety', label: 'Safety' },
  ];

  // Swipe gesture for mobile tab navigation
  const isMobile = useIsMobile();
  const handleSwipeLeft = useCallback(() => {
    setActiveTab(prev => {
      const idx = tabs.findIndex(t => t.id === prev);
      return idx < tabs.length - 1 ? tabs[idx + 1].id : prev;
    });
  }, [tabs]);
  const handleSwipeRight = useCallback(() => {
    setActiveTab(prev => {
      const idx = tabs.findIndex(t => t.id === prev);
      return idx > 0 ? tabs[idx - 1].id : prev;
    });
  }, [tabs]);
  const swipeRef = useSwipeGesture<HTMLDivElement>({
    onSwipeLeft: handleSwipeLeft,
    onSwipeRight: handleSwipeRight,
    enabled: isMobile,
  });

  // Loading without any data
  if (!data && insightsLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-[#d4af37] animate-spin" />
          <p className="text-[#94a3b8] text-[15px]">Loading GCAA data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ═══════════════════ TOP SECTION ═══════════════════ */}
      <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] p-3 md:p-5">
        <div className="flex items-start justify-between gap-4">
          {/* Left: Health Score Gauge */}
          <div className="flex items-center gap-3 md:gap-5 flex-1 min-w-0">
            {insights?.overall?.health_score != null ? (
              <div className="flex flex-col items-center flex-shrink-0">
                <HealthScoreTooltip score={insights.overall.health_score} breakdown={health?.breakdown} size={100} />
                {health && (
                  <HealthBreakdownSection breakdown={health.breakdown} score={health.score} label={health.label} severity={health.severity} />
                )}
              </div>
            ) : health ? (
              <div className="flex flex-col items-center flex-shrink-0">
                <HealthScoreTooltip score={health.score} severity={health.severity} breakdown={health.breakdown} size={100} />
                <HealthBreakdownSection breakdown={health.breakdown} score={health.score} label={health.label} severity={health.severity} />
              </div>
            ) : insightsLoading ? (
              <div className="w-[100px] h-[100px] flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-[#64748b] animate-spin" />
              </div>
            ) : null}

            {/* Center: Headline */}
            <div className="min-w-0 flex-1">
              {insights?.overall?.headline ? (
                <>
                  <p className="text-[10px] uppercase tracking-widest text-[#d4af37] font-semibold mb-1">AI Analysis</p>
                  <p className="text-base md:text-[20px] font-bold text-[#f1f5f9] leading-snug">
                    {insights.overall.headline}
                  </p>
                  {insights.overall.summary && (
                    <p className="text-[#94a3b8] text-[15px] mt-1 leading-relaxed">{insights.overall.summary}</p>
                  )}
                </>
              ) : health ? (
                <div>
                  <p className="text-base md:text-[20px] font-bold text-[#f1f5f9] leading-snug">
                    GCAA — {health.label}
                  </p>
                  <p className="text-[#94a3b8] text-[15px] mt-1">Guyana Civil Aviation Authority — Regulatory Dashboard</p>
                </div>
              ) : (
                <p className="text-[#94a3b8] text-[15px]">GCAA — Regulatory Compliance Dashboard</p>
              )}
            </div>
          </div>

          {/* Right: Controls */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => {/* Upload placeholder */}}
              className="px-3 py-1.5 min-h-[44px] bg-[#2d3a52] hover:bg-[#3d4a62] text-[#94a3b8] rounded-lg text-sm flex items-center gap-1.5 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Upload
            </button>
            {insights && (
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="px-3 py-1.5 min-h-[44px] bg-[#2d3a52] hover:bg-[#3d4a62] text-[#94a3b8] rounded-lg text-sm flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${regenerating ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
        </div>

        {/* Cross-Cutting Issues */}
        {insights?.cross_cutting && (insights.cross_cutting.issues.length > 0 || insights.cross_cutting.opportunities.length > 0) && (
          <div className="mt-4">
            <CollapsibleSection title="Cross-Cutting Issues" icon={AlertTriangle} defaultOpen={false}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {insights.cross_cutting.issues.length > 0 && (
                  <div>
                    <p className="text-amber-400 text-sm font-medium mb-2">Issues</p>
                    <ul className="space-y-1.5">
                      {insights.cross_cutting.issues.map((issue, i) => (
                        <li key={i} className="text-[#94a3b8] text-sm flex items-start gap-2">
                          <span className="text-amber-400 mt-0.5">•</span>
                          {issue}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {insights.cross_cutting.opportunities.length > 0 && (
                  <div>
                    <p className="text-emerald-400 text-sm font-medium mb-2">Opportunities</p>
                    <ul className="space-y-1.5">
                      {insights.cross_cutting.opportunities.map((opp, i) => (
                        <li key={i} className="text-[#94a3b8] text-sm flex items-start gap-2">
                          <span className="text-emerald-400 mt-0.5">•</span>
                          {opp}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </CollapsibleSection>
          </div>
        )}
      </div>

      {/* ═══════════════════ TAB BAR ═══════════════════ */}
      <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] p-1.5 overflow-x-auto scrollbar-hide">
        <div className="flex gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex-shrink-0 px-4 py-2.5 min-h-[44px] rounded-lg text-sm md:text-base font-medium transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-[#d4af37] text-[#0a1628] shadow-lg shadow-[#d4af37]/20'
                  : 'text-[#94a3b8] hover:text-[#f1f5f9] hover:bg-[#2d3a52]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══════════════════ TAB CONTENT ═══════════════════ */}
      <div ref={swipeRef} className="min-h-[400px]">

        {/* ────────── TAB 1: COMPLIANCE ────────── */}
        {activeTab === 'compliance' && (
          <div className="space-y-4">
            <h3 className="text-[#f1f5f9] font-medium text-lg md:text-[22px]">Regulatory Compliance</h3>

            {data ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Compliance Rate Radial */}
                  <div className="bg-[#1a2744] rounded-xl p-3 md:p-5 border border-[#2d3a52]">
                    <h4 className="text-[#94a3b8] text-sm mb-4">Compliance Audit Rate</h4>
                    <div className="flex flex-col items-center">
                      <div className="relative w-32 h-32">
                        <svg className="w-full h-full transform -rotate-90">
                          <circle cx="64" cy="64" r="56" stroke="#2d3a52" strokeWidth="12" fill="none" />
                          <circle
                            cx="64" cy="64" r="56"
                            stroke={data.complianceRate >= 90 ? '#10b981' : '#f59e0b'}
                            strokeWidth="12" fill="none"
                            strokeDasharray={`${(data.complianceRate / 100) * 352} 352`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className={`text-xl md:text-2xl font-bold ${data.complianceRate >= 90 ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {data.complianceRate?.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      <p className="text-[#64748b] text-sm mt-3">Target: 95%</p>
                    </div>
                  </div>

                  {/* Safety Audits */}
                  <KPICard
                    title="Safety Audits Completed"
                    value={data.safetyAudits}
                    subtitle="This period"
                    status="good"
                  />
                </div>
              </>
            ) : (
              <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] p-6 md:p-12 text-center">
                <p className="text-[#64748b] text-base">No compliance data available. Upload GCAA reports to populate.</p>
              </div>
            )}

            {/* AI Insights */}
            {insights?.compliance?.cards && insights.compliance.cards.length > 0 && (
              <div className="space-y-3">
                <p className="text-[10px] uppercase tracking-widest text-[#d4af37] font-semibold">AI Compliance Insights</p>
                {insights.compliance.cards.map((card, i) => (
                  <InsightCard key={i} card={card} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ────────── TAB 2: INSPECTIONS ────────── */}
        {activeTab === 'inspections' && (
          <div className="space-y-4">
            <h3 className="text-[#f1f5f9] font-medium text-lg md:text-[22px]">Inspection Program</h3>

            {data ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <KPICard
                    title="Inspections MTD"
                    value={data.inspectionsMTD}
                    subtitle={`of ${data.inspectionsTarget} target`}
                  >
                    <div className="mt-2">
                      <ProgressBar value={data.inspectionsMTD} max={data.inspectionsTarget} showValue={false} size="sm" colorMode="success" />
                    </div>
                  </KPICard>
                  <KPICard
                    title="Completion Rate"
                    value={`${Math.round((data.inspectionsMTD / data.inspectionsTarget) * 100)}%`}
                    status={data.inspectionsMTD / data.inspectionsTarget >= 0.75 ? 'good' : 'warning'}
                  />
                </div>

                {/* Weekly Inspections Chart */}
                {data.inspectionTrend && data.inspectionTrend.length > 0 && (
                  <CollapsibleSection title="Weekly Inspection Trend" icon={BarChart3} defaultOpen={false}>
                    <div className="h-40">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.inspectionTrend}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2d3a52" />
                          <XAxis dataKey="week" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                          <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#1a2744', border: '1px solid #2d3a52', borderRadius: '8px' }}
                            formatter={(value: number) => [value, 'Completed']}
                          />
                          <Bar dataKey="completed" fill="#0d9488" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CollapsibleSection>
                )}
              </>
            ) : (
              <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] p-6 md:p-12 text-center">
                <p className="text-[#64748b] text-base">No inspection data available. Upload GCAA reports to populate.</p>
              </div>
            )}

            {/* AI Insights */}
            {insights?.inspections?.cards && insights.inspections.cards.length > 0 && (
              <div className="space-y-3">
                <p className="text-[10px] uppercase tracking-widest text-[#d4af37] font-semibold">AI Inspection Insights</p>
                {insights.inspections.cards.map((card, i) => (
                  <InsightCard key={i} card={card} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ────────── TAB 3: REGISTRATIONS ────────── */}
        {activeTab === 'registrations' && (
          <div className="space-y-4">
            <h3 className="text-[#f1f5f9] font-medium text-lg md:text-[22px]">Aircraft Registrations</h3>

            {data ? (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <KPICard
                  title="Active Aircraft"
                  value={data.activeRegistrations}
                  status="good"
                />
                <KPICard
                  title="Pending Certifications"
                  value={data.pendingCertifications}
                  status={data.pendingCertifications > 5 ? 'warning' : 'good'}
                />
                <KPICard
                  title="Renewals Pending"
                  value={data.renewalsPending ?? 0}
                  status={(data.renewalsPending ?? 0) > 10 ? 'warning' : 'good'}
                  subtitle="Licenses"
                />
              </div>
            ) : (
              <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] p-6 md:p-12 text-center">
                <p className="text-[#64748b] text-base">No registration data available. Upload GCAA reports to populate.</p>
              </div>
            )}

            {/* AI Insights */}
            {insights?.registrations?.cards && insights.registrations.cards.length > 0 && (
              <div className="space-y-3">
                <p className="text-[10px] uppercase tracking-widest text-[#d4af37] font-semibold">AI Registration Insights</p>
                {insights.registrations.cards.map((card, i) => (
                  <InsightCard key={i} card={card} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ────────── TAB 4: SAFETY ────────── */}
        {activeTab === 'safety' && (
          <div className="space-y-4">
            <h3 className="text-[#f1f5f9] font-medium text-lg md:text-[22px]">Safety & Incidents</h3>

            {data ? (
              <div className="grid grid-cols-2 gap-4">
                <KPICard
                  title="Incident Reports"
                  value={data.incidentReports ?? 0}
                  status={(data.incidentReports ?? 0) === 0 ? 'good' : 'critical'}
                  subtitle="This month"
                />
                <KPICard
                  title="Safety Audits"
                  value={data.safetyAudits}
                  status="good"
                  subtitle="Completed this period"
                />
              </div>
            ) : (
              <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] p-6 md:p-12 text-center">
                <p className="text-[#64748b] text-base">No safety data available. Upload GCAA reports to populate.</p>
              </div>
            )}

            {/* AI Insights */}
            {insights?.safety?.cards && insights.safety.cards.length > 0 && (
              <div className="space-y-3">
                <p className="text-[10px] uppercase tracking-widest text-[#d4af37] font-semibold">AI Safety Insights</p>
                {insights.safety.cards.map((card, i) => (
                  <InsightCard key={i} card={card} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Data source footer */}
      <p className="text-[#64748b] text-[10px] sm:text-xs text-center">
        Source: GCAA Monthly Reports | Regulatory compliance and inspection data
      </p>
    </div>
  );
}
