'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Upload, RefreshCw, Loader2, AlertTriangle,
} from 'lucide-react';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import type { InsightCardData } from '@/components/ui/InsightCard';
import { HealthScoreTooltip } from '@/components/ui/HealthScoreTooltip';
import { HealthBreakdownSection } from '@/components/ui/HealthBreakdownSection';
import { computeCJIAHealth } from '@/lib/agency-health';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { CJIAData } from '@/data/mockData';

import { CJIAOverviewTab } from '@/components/intel/cjia/CJIAOverviewTab';
import { CJIAPassengerTab } from '@/components/intel/cjia/CJIAPassengerTab';
import { CJIAOperationsTab } from '@/components/intel/cjia/CJIAOperationsTab';

// ── Types ───────────────────────────────────────────────────────────────────

interface CJIAInsights {
  overall?: {
    health_score?: number;
    headline?: string;
    summary?: string;
  };
  operations?: { cards?: InsightCardData[] };
  passengers?: { cards?: InsightCardData[] };
  revenue?: { cards?: InsightCardData[] };
  projects?: { cards?: InsightCardData[] };
  cross_cutting?: {
    issues: string[];
    opportunities: string[];
  };
}

interface CJIADetailProps {
  data?: CJIAData;
}

// ── Tab Configuration ───────────────────────────────────────────────────────

const TABS = [
  { id: 'operations', label: 'Ops', fullLabel: 'Operations' },
  { id: 'passengers', label: 'Passengers', fullLabel: 'Passenger Stats' },
  { id: 'revenue', label: 'Revenue', fullLabel: 'Revenue' },
  { id: 'projects', label: 'Projects', fullLabel: 'Projects' },
] as const;

// ── Main Component ──────────────────────────────────────────────────────────

export function CJIADetail({ data }: CJIADetailProps) {
  // State
  const [activeTab, setActiveTab] = useState('operations');
  const [insights, setInsights] = useState<CJIAInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [regenerating, setRegenerating] = useState(false);

  // Fetch insights with AbortController for cleanup on unmount/month change
  useEffect(() => {
    const controller = new AbortController();
    async function fetchInsights() {
      setInsightsLoading(true);
      try {
        const url = selectedMonth
          ? `/api/cjia/insights/${selectedMonth}`
          : '/api/cjia/insights/latest';
        const res = await fetch(url, { signal: controller.signal });
        const json = await res.json();
        if (!controller.signal.aborted) {
          setInsights(json.success && json.data ? json.data : null);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error('Failed to fetch CJIA insights:', err);
        }
      } finally {
        if (!controller.signal.aborted) setInsightsLoading(false);
      }
    }
    fetchInsights();
    return () => controller.abort();
  }, [selectedMonth]);

  // Regenerate AI insights
  const handleRegenerate = async () => {
    if (!selectedMonth && !data) return;
    setRegenerating(true);
    try {
      const month = selectedMonth || new Date().toISOString().slice(0, 7);
      const res = await fetch('/api/cjia/insights/generate', {
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
  const health = useMemo(() => data ? computeCJIAHealth(data) : null, [data]);

  // Swipe gesture for mobile tab navigation
  const isMobile = useIsMobile();

  const handleSwipeLeft = useCallback(() => {
    setActiveTab(prev => {
      const idx = TABS.findIndex(t => t.id === prev);
      return idx < TABS.length - 1 ? TABS[idx + 1].id : prev;
    });
  }, []);

  const handleSwipeRight = useCallback(() => {
    setActiveTab(prev => {
      const idx = TABS.findIndex(t => t.id === prev);
      return idx > 0 ? TABS[idx - 1].id : prev;
    });
  }, []);

  const swipeRef = useSwipeGesture<HTMLDivElement>({
    onSwipeLeft: handleSwipeLeft,
    onSwipeRight: handleSwipeRight,
    enabled: isMobile,
  });

  // Loading without any data
  if (!data && insightsLoading) {
    return (
      <div className="flex items-center justify-center py-24" role="status" aria-label="Loading">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-gold-500 animate-spin" aria-hidden="true" />
          <p className="text-slate-400 text-[15px]">Loading CJIA data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ═══════════════════ TOP SECTION ═══════════════════ */}
      <div className="bg-navy-900 rounded-xl border border-navy-800 p-3 md:p-5">
        <div className="flex flex-col md:flex-row items-start justify-between gap-4">
          {/* Left: Health Score Gauge */}
          <div className="flex flex-col md:flex-row items-center gap-5 w-full md:flex-1 md:min-w-0">
            {insights?.overall?.health_score != null ? (
              <div className="flex-shrink-0">
                <HealthScoreTooltip score={insights.overall.health_score} breakdown={health?.breakdown} size={100} />
              </div>
            ) : health ? (
              <div className="flex-shrink-0">
                <HealthScoreTooltip score={health.score} severity={health.severity} breakdown={health.breakdown} size={100} />
              </div>
            ) : insightsLoading ? (
              <div className="w-20 h-20 md:w-[100px] md:h-[100px] flex items-center justify-center" role="status" aria-label="Loading">
                <Loader2 className="w-6 h-6 text-navy-600 animate-spin" aria-hidden="true" />
              </div>
            ) : null}

            {/* Center: Headline */}
            <div className="min-w-0 flex-1">
              {insights?.overall?.headline ? (
                <>
                  <p className="text-[10px] uppercase tracking-widest text-gold-500 font-semibold mb-1">AI Analysis</p>
                  <p className="text-base md:text-[20px] font-bold text-slate-100 leading-snug line-clamp-3 md:line-clamp-none">
                    {insights.overall.headline}
                  </p>
                  {insights.overall.summary && (
                    <p className="text-slate-400 text-[15px] mt-1 leading-relaxed line-clamp-2 md:line-clamp-none">{insights.overall.summary}</p>
                  )}
                </>
              ) : health ? (
                <div>
                  <p className="text-[20px] font-bold text-slate-100 leading-snug">
                    CJIA — {health.label}
                  </p>
                  <p className="text-slate-400 text-[15px] mt-1">
                    {data?.mtdPeriod ? `Current period: ${data.mtdPeriod}` : 'Cheddi Jagan International Airport'}
                  </p>
                </div>
              ) : (
                <p className="text-slate-400 text-[15px]">CJIA — Airport Operations Dashboard</p>
              )}
            </div>
          </div>

          {/* Right: Controls */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => {/* Upload placeholder */}}
              className="px-3 py-1.5 bg-navy-800 hover:bg-[#3d4a62] text-slate-400 rounded-lg text-sm flex items-center gap-1.5 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Upload
            </button>
            {insights && (
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="px-3 py-1.5 bg-navy-800 hover:bg-[#3d4a62] text-slate-400 rounded-lg text-sm flex items-center gap-1.5 transition-colors disabled:opacity-50"
                aria-label="Regenerate analysis"
              >
                <RefreshCw className={`w-4 h-4 ${regenerating ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
        </div>

        {/* Health Breakdown — full-width below the header row */}
        {health && (
          <HealthBreakdownSection breakdown={health.breakdown} score={health.score} label={health.label} severity={health.severity} />
        )}

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
                        <li key={i} className="text-slate-400 text-sm flex items-start gap-2">
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
                        <li key={i} className="text-slate-400 text-sm flex items-start gap-2">
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
      <div className="bg-navy-900 rounded-xl border border-navy-800 p-1.5">
        <div className="flex gap-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-2 md:px-4 py-2 md:py-2.5 rounded-lg text-xs md:text-base font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-gold-500 text-navy-950 shadow-lg shadow-gold-500/20'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-navy-800'
              }`}
            >
              <span className="md:hidden">{tab.label}</span>
              <span className="hidden md:inline">{tab.fullLabel}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ═══════════════════ TAB CONTENT ═══════════════════ */}
      <div ref={swipeRef} className="min-h-[400px]">
        {activeTab === 'operations' && (
          <CJIAOverviewTab
            data={data}
            operationsInsights={insights?.operations?.cards}
          />
        )}

        {activeTab === 'passengers' && (
          <CJIAPassengerTab
            data={data}
            passengerInsights={insights?.passengers?.cards}
          />
        )}

        {activeTab === 'revenue' && (
          <CJIAOperationsTab
            variant="revenue"
            revenueInsights={insights?.revenue?.cards}
          />
        )}

        {activeTab === 'projects' && (
          <CJIAOperationsTab
            variant="projects"
            projectInsights={insights?.projects?.cards}
          />
        )}
      </div>

      {/* Data source footer */}
      <p className="text-navy-600 text-[10px] sm:text-xs text-center">
        Source: CJIA Passenger Movement Reports | January 2026 data: Jan 1-26 (partial month)
      </p>
    </div>
  );
}
