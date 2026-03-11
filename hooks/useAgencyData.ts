'use client';

/**
 * Thin facade that composes the split agency hooks.
 *
 * Domain logic lives in:
 *   - hooks/useGPLData.ts      — GPL data fetching + computeGPLSummary
 *   - hooks/useGWIData.ts      — GWI report fetching + buildGWIGridMetrics
 *   - hooks/useAgencyHealth.ts — status, metrics, trends, warning badges, grid metric builders
 *
 * This file orchestrates them into the same public API that consumers expect.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { generateAgencyData, getSparklineData } from '@/data/mockData';
import type { AgencyRawData } from '@/data/mockData';
import { Plane, Droplets, Zap, Shield } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { computeGPLHealth, computeGWIHealth, computeCJIAHealth, computeGCAAHealth } from '@/lib/agency-health';
import { fetchWithOffline } from '@/lib/offline/sync-manager';
import { API_PATHS } from '@/lib/constants/api-paths';

// Split hooks
import { useGPLData, computeGPLSummary } from './useGPLData';
import { useGWIData, buildGWIGridMetrics } from './useGWIData';
import {
  getAgencyStatus,
  getAgencyMetrics,
  getAgencyTrend,
  getAgencyWarningBadge,
  buildGPLGridMetrics,
  buildCJIAGridMetrics,
  buildGCAAGridMetrics,
} from './useAgencyHealth';

// Re-export computeGPLSummary so existing consumers can still import it from here
export { computeGPLSummary };

// ── Agency configuration ─────────────────────────────────────────────────────

interface AgencyConfig {
  id: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  accentColor: string;
}

const AGENCY_CONFIG: Record<string, AgencyConfig> = {
  cjia: {
    id: 'cjia',
    title: 'CJIA',
    subtitle: 'Cheddi Jagan International Airport',
    icon: Plane,
    accentColor: 'from-sky-500 to-blue-600',
  },
  gwi: {
    id: 'gwi',
    title: 'GWI',
    subtitle: 'Guyana Water Inc.',
    icon: Droplets,
    accentColor: 'from-cyan-500 to-teal-600',
  },
  gpl: {
    id: 'gpl',
    title: 'GPL',
    subtitle: 'Guyana Power & Light',
    icon: Zap,
    accentColor: 'from-amber-500 to-orange-600',
  },
  gcaa: {
    id: 'gcaa',
    title: 'GCAA',
    subtitle: 'Guyana Civil Aviation Authority',
    icon: Shield,
    accentColor: 'from-violet-500 to-purple-600',
  },
};

// ── Types ────────────────────────────────────────────────────────────────────

export interface DelayedCounts {
  gpl: number;
  gwi: number;
  cjia: number;
  gcaa: number;
  heci: number;
  has: number;
  marad: number;
  mopua: number;
  total: number;
}

// ── Facade Hook ──────────────────────────────────────────────────────────────

export const useAgencyData = () => {
  const [rawData, setRawData] = useState<AgencyRawData>(generateAgencyData());
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [isLoading, setIsLoading] = useState(false);
  const [gwiReport, setGwiReport] = useState<any>(null);
  const [gwiPrevReport, setGwiPrevReport] = useState<any>(null);
  const [delayedCounts, setDelayedCounts] = useState<DelayedCounts | null>(null);

  // Compose split hooks
  const { fetchGPLData } = useGPLData();
  const { fetchGWIReport } = useGWIData();

  const fetchDelayedCounts = useCallback(async (): Promise<DelayedCounts | null> => {
    try {
      const result = await fetchWithOffline<DelayedCounts>(API_PATHS.DELAYED_COUNTS, 'projects', 'delayed-counts');
      return result.data;
    } catch {
      return null;
    }
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);

    const [gplData, gwiData, delayed] = await Promise.all([
      fetchGPLData(),
      fetchGWIReport(),
      fetchDelayedCounts(),
    ]);
    const mockData = generateAgencyData();

    if (gwiData) {
      setGwiReport(gwiData.current);
      setGwiPrevReport(gwiData.previous);
    }
    if (delayed) setDelayedCounts(delayed);

    setRawData({
      ...mockData,
      gpl: gplData || mockData.gpl,
    });

    setLastUpdated(new Date());
    setIsLoading(false);
  }, [fetchGPLData, fetchGWIReport, fetchDelayedCounts]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const agencies = useMemo(() => Object.keys(AGENCY_CONFIG).map(id => {
    const config = AGENCY_CONFIG[id];
    const data = rawData[id as keyof AgencyRawData];

    // Compute health score
    const health = id === 'gpl' ? computeGPLHealth(rawData.gpl)
      : id === 'gwi' ? computeGWIHealth(gwiReport)
      : id === 'cjia' ? computeCJIAHealth(rawData.cjia)
      : id === 'gcaa' ? computeGCAAHealth(rawData.gcaa)
      : null;

    // Build grid metrics and append delayed projects count
    let gridMetrics = id === 'gwi' ? buildGWIGridMetrics(gwiReport, gwiPrevReport)
      : id === 'gpl' ? buildGPLGridMetrics(rawData.gpl)
      : id === 'cjia' ? buildCJIAGridMetrics(rawData.cjia)
      : id === 'gcaa' ? buildGCAAGridMetrics(rawData.gcaa)
      : undefined;

    if (gridMetrics && delayedCounts) {
      const count = delayedCounts[id as keyof DelayedCounts] as number ?? 0;
      gridMetrics = [
        ...gridMetrics,
        {
          label: 'Delayed Projects',
          value: String(count),
          badge: count > 0 ? `\u26A0 ${count} overdue` : '0 delayed \u2713',
          badgeColor: count > 0 ? 'red' as const : 'green' as const,
        },
      ];
    }

    return {
      ...config,
      status: getAgencyStatus(id, data),
      metrics: getAgencyMetrics(id, data),
      gridMetrics,
      healthScore: health?.score,
      healthLabel: health?.label,
      healthSeverity: health?.severity,
      healthBreakdown: health?.breakdown ?? null,
      sparklineData: getSparklineData(id, data),
      trend: getAgencyTrend(id, data),
      warningBadge: getAgencyWarningBadge(id, data),
      data,
    };
  }), [rawData, gwiReport, gwiPrevReport, delayedCounts]);

  const gplSummary = useMemo(() => computeGPLSummary(rawData.gpl), [rawData.gpl]);

  const alerts = useMemo(() => [
    ...(rawData.gwi.nrwPercent > 55 ? [{
      severity: 'critical' as const,
      agency: 'gwi',
      message: `Non-Revenue Water at ${rawData.gwi.nrwPercent}%`,
      detail: 'Exceeds 55% critical threshold',
    }] : []),
    ...(rawData.cjia.safetyIncidents > 0 ? [{
      severity: 'critical' as const,
      agency: 'cjia',
      message: `${rawData.cjia.safetyIncidents} safety incident(s) reported`,
      detail: 'Immediate action required',
    }] : []),
    ...(gplSummary && gplSummary.reserve < 0 ? [{
      severity: 'critical' as const,
      agency: 'gpl',
      message: `Capacity deficit: ${Math.abs(gplSummary.reserve).toFixed(1)} MW below current demand`,
      detail: `DBIS Capacity: ${gplSummary.totalDBIS} MW | Evening Peak: ${gplSummary.actualPeak} MW`,
    }] : []),
    ...(gplSummary && gplSummary.reserve >= 0 && gplSummary.reserve < 20 ? [{
      severity: 'warning' as const,
      agency: 'gpl',
      message: `Low reserve margin: ${gplSummary.reserve.toFixed(1)} MW`,
      detail: `DBIS Capacity: ${gplSummary.totalDBIS} MW | Evening Peak: ${gplSummary.actualPeak} MW`,
    }] : []),
    ...(gplSummary && gplSummary.criticalCount > 0 ? [{
      severity: 'warning' as const,
      agency: 'gpl',
      message: `${gplSummary.criticalCount} power station(s) at critical capacity`,
      detail: 'Operating below 50% of derated capacity',
    }] : []),
    ...(rawData.gwi.activeDisruptions > 2 ? [{
      severity: 'warning' as const,
      agency: 'gwi',
      message: `${rawData.gwi.activeDisruptions} service disruptions active`,
      detail: rawData.gwi.disruptionAreas.join(', '),
    }] : []),
  ], [rawData.gwi, rawData.cjia, gplSummary]);

  const loadGPLByDate = useCallback(async (date: string) => {
    setIsLoading(true);
    const gplData = await fetchGPLData(date);
    if (gplData) {
      setRawData(prev => ({ ...prev, gpl: gplData }));
    }
    setLastUpdated(new Date());
    setIsLoading(false);
    return gplData;
  }, [fetchGPLData]);

  return {
    agencies,
    alerts,
    rawData,
    lastUpdated,
    isLoading,
    refresh,
    loadGPLByDate,
  };
};
