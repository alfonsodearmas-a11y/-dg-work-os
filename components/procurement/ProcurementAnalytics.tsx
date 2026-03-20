'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Package } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { useIsMobile } from '@/hooks/useIsMobile';
import { AnalyticsKpiRow } from './analytics/AnalyticsKpiRow';
import { AnalyticsPipelineFunnel } from './analytics/AnalyticsPipelineFunnel';
import { AnalyticsAgencyBreakdown } from './analytics/AnalyticsAgencyBreakdown';
import { AnalyticsStalledPanel } from './analytics/AnalyticsStalledPanel';
import { AnalyticsTimeInStage } from './analytics/AnalyticsTimeInStage';
import { AnalyticsMethodDistribution } from './analytics/AnalyticsMethodDistribution';
import { AnalyticsCompletionRate } from './analytics/AnalyticsCompletionRate';
import type { ProcurementPackage, PipelineStats, ProcurementStage, ProcurementMethod } from '@/lib/procurement-types';
import { PROCUREMENT_STAGES } from '@/lib/procurement-types';

// ── Filter types ────────────────────────────────────────────────────────

interface Filters {
  agencies: string[];
  methods: ProcurementMethod[];
  stages: ProcurementStage[];
}

interface ProcurementAnalyticsProps {
  onPackageClick?: (packageId: string) => void;
}

// ── Component ───────────────────────────────────────────────────────────

export function ProcurementAnalytics({ onPackageClick }: ProcurementAnalyticsProps) {
  const isMobile = useIsMobile();
  const [packages, setPackages] = useState<ProcurementPackage[]>([]);
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({ agencies: [], methods: [], stages: [] });

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/procurement');
      if (!res.ok) return;
      const data = await res.json();
      setPackages(data.packages || []);
      setStats(data.stats || null);
    } catch {
      // Silently fail — analytics are non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Derived filtered data ──────────────────────────────────────────

  const filteredPackages = useMemo(() => {
    const { agencies, methods, stages } = filters;
    if (agencies.length === 0 && methods.length === 0 && stages.length === 0) return packages;
    return packages.filter((p) =>
      (agencies.length === 0 || agencies.includes(p.agency.toUpperCase())) &&
      (methods.length === 0 || methods.includes(p.procurement_method)) &&
      (stages.length === 0 || stages.includes(p.current_stage))
    );
  }, [packages, filters]);

  const filteredStats = useMemo((): PipelineStats | null => {
    if (!stats && filteredPackages.length === 0) return null;
    // Recompute stats from filtered packages
    const by_stage = Object.fromEntries(
      PROCUREMENT_STAGES.map((s) => [s, { count: 0, total_value: 0 }]),
    ) as PipelineStats['by_stage'];

    let totalActive = 0;
    let totalValue = 0;
    let stalledCount = 0;

    for (const pkg of filteredPackages) {
      by_stage[pkg.current_stage].count++;
      by_stage[pkg.current_stage].total_value += pkg.estimated_value;
      if (pkg.current_stage !== 'awarded') {
        totalActive++;
        totalValue += pkg.estimated_value;
      }
      if (pkg.current_stage !== 'awarded' && pkg.days_at_current_stage > 30) {
        stalledCount++;
      }
    }

    return {
      total_active: totalActive,
      total_value: totalValue,
      avg_days_to_award: stats?.avg_days_to_award ?? 0,
      stalled_count: stalledCount,
      by_stage,
    };
  }, [filteredPackages, stats]);

  // Discover agencies present in data
  const availableAgencies = useMemo(() => {
    const set = new Set<string>();
    packages.forEach((p) => set.add(p.agency.toUpperCase()));
    return Array.from(set).sort();
  }, [packages]);

  // ── Filter bar handlers ────────────────────────────────────────────

  const toggleAgency = (agency: string) => {
    setFilters((f) => ({
      ...f,
      agencies: f.agencies.includes(agency)
        ? f.agencies.filter((a) => a !== agency)
        : [...f.agencies, agency],
    }));
  };

  const clearFilters = () => setFilters({ agencies: [], methods: [], stages: [] });
  const hasFilters = filters.agencies.length > 0 || filters.methods.length > 0 || filters.stages.length > 0;

  // ── Loading ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4">
        {/* KPI skeleton */}
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 bg-navy-900 rounded-xl border border-navy-800 animate-pulse" />
          ))}
        </div>
        {/* Chart skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3 h-72 bg-navy-900 rounded-xl border border-navy-800 animate-pulse" />
          <div className="lg:col-span-2 h-72 bg-navy-900 rounded-xl border border-navy-800 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-64 bg-navy-900 rounded-xl border border-navy-800 animate-pulse" />
          <div className="h-64 bg-navy-900 rounded-xl border border-navy-800 animate-pulse" />
        </div>
      </div>
    );
  }

  if (packages.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-navy-800 flex items-center justify-center mx-auto mb-4">
            <Package className="w-7 h-7 text-navy-600" />
          </div>
          <p className="text-navy-600 text-sm">No procurement data available.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-5">

      {/* ── Row 1: Filter bar ─────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        {availableAgencies.map((agency) => {
          const active = filters.agencies.includes(agency);
          return (
            <button
              key={agency}
              onClick={() => toggleAgency(agency)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                active
                  ? 'bg-gold-500/20 text-gold-500 border-gold-500/30'
                  : 'bg-navy-900 text-navy-600 border-navy-800 hover:text-white hover:border-navy-700'
              }`}
            >
              {agency}
            </button>
          );
        })}
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-navy-600 hover:text-red-400 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* ── Row 2: KPI Summary Cards ──────────────────────────────── */}
      <AnalyticsKpiRow stats={filteredStats} />

      {/* ── Row 3: Pipeline Funnel + Agency Breakdown ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 md:gap-4">
        <div className="lg:col-span-3">
          <AnalyticsPipelineFunnel stats={filteredStats} isMobile={isMobile} />
        </div>
        <div className="lg:col-span-2">
          <AnalyticsAgencyBreakdown packages={filteredPackages} />
        </div>
      </div>

      {/* ── Row 4: Stuck Packages + Time in Stage ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
        <AnalyticsStalledPanel
          packages={filteredPackages}
          onPackageClick={onPackageClick}
          isMobile={isMobile}
        />
        <AnalyticsTimeInStage packages={filteredPackages} isMobile={isMobile} />
      </div>

      {/* ── Row 5: Method Distribution + Completion Rate ──────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
        <AnalyticsMethodDistribution packages={filteredPackages} isMobile={isMobile} />
        <AnalyticsCompletionRate packages={filteredPackages} />
      </div>
    </div>
  );
}
