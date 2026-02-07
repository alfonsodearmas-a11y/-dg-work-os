'use client';

import { useState, useCallback, useEffect } from 'react';
import { generateAgencyData, getSparklineData } from '@/data/mockData';
import type { AgencyRawData, GPLData, CJIAData, GCAAData } from '@/data/mockData';
import { Plane, Droplets, Zap, Shield } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { GridMetric } from '@/components/intel/AgencyCard';
import { computeGPLHealth, computeGWIHealth, computeCJIAHealth, computeGCAAHealth, type HealthBreakdownItem } from '@/lib/agency-health';

// Transform API response to match expected GPL data structure
const transformGPLData = (apiData: any): GPLData | null => {
  if (!apiData?.stations || !apiData?.summary) {
    return null;
  }

  const { summary, stations, analysis } = apiData;

  const powerStations = stations.map((station: any) => {
    const stationName = station.station || 'Unknown';
    return {
      code: stationName.toUpperCase().replace(/\s+/g, '_'),
      name: stationName,
      type: 'fossil' as const,
      units: parseInt(station.total_units) || 0,
      onlineUnits: parseInt(station.units_online) || 0,
      derated: parseFloat(station.total_derated_capacity_mw) || 0,
      available: parseFloat(station.total_available_mw) || 0,
    };
  });

  const solarStations = [
    { name: 'Hampshire Solar', capacity: parseFloat(summary.hampshire_solar_mwp ?? summary.solar_hampshire_mwp) || 0 },
    { name: 'Prospect Solar', capacity: parseFloat(summary.prospect_solar_mwp ?? summary.solar_prospect_mwp) || 0 },
    { name: 'Trafalgar Solar', capacity: parseFloat(summary.trafalgar_solar_mwp ?? summary.solar_trafalgar_mwp) || 0 },
  ].filter(s => s.capacity > 0);

  return {
    source: 'API',
    capacityDate: summary.report_date || '',
    peakDemandDate: summary.report_date || '',
    powerStations,
    solarStations,
    totalRenewableCapacity: parseFloat(summary.total_renewable_mwp) || 0,
    forcedOutageRate: parseFloat(summary.average_for) * 100 || 7.5,
    expectedPeakDemand: parseFloat(summary.expected_peak_demand_mw) || 200,
    actualEveningPeak: {
      onBars: parseFloat(summary.evening_peak_on_bars_mw) || 0,
      suppressed: parseFloat(summary.evening_peak_suppressed_mw) || 0,
    },
    actualDayPeak: {
      onBars: parseFloat(summary.day_peak_on_bars_mw) || 0,
      suppressed: parseFloat(summary.day_peak_suppressed_mw) || 0,
    },
    generationAvailAtSuppressed: null,
    approximateSuppressedPeak: null,
    peakDemandHistory: [],
    reportDate: summary.report_date,
    // analysis may be the raw generateGPLBriefing result: { success, executiveBriefing, criticalAlerts, ... }
    // or wrapped in analysis_data. Normalize to the inner analysis object.
    aiAnalysis: analysis?.analysis_data || analysis || null,
  };
};

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

// Compute GPL summary from power station data
export const computeGPLSummary = (data: GPLData | null) => {
  if (!data?.powerStations) return null;

  const stations = data.powerStations;
  const totalDerated = stations.reduce((sum, s) => sum + s.derated, 0);
  const totalAvailable = stations.reduce((sum, s) => sum + s.available, 0);

  const stationStatuses = stations.map(s => {
    if (s.available === 0) return 'offline';
    if (s.available / s.derated < 0.5) return 'critical';
    if (s.available / s.derated < 0.8) return 'degraded';
    return 'operational';
  });

  const offlineCount = stationStatuses.filter(s => s === 'offline').length;
  const criticalCount = stationStatuses.filter(s => s === 'critical').length;
  const degradedCount = stationStatuses.filter(s => s === 'degraded').length;
  const stationsBelowCapacity = offlineCount + criticalCount + degradedCount;

  const totalSolar = data.solarStations?.reduce((sum, s) => sum + s.capacity, 0) || data.totalRenewableCapacity || 0;
  const totalDBIS = totalAvailable + totalSolar;
  const actualPeak = data.actualEveningPeak?.onBars || 0;
  const actualReserve = totalDBIS - actualPeak;

  const expectedCapacity = totalAvailable * (1 - (data.forcedOutageRate || 7.5) / 100);
  const expectedPeak = data.expectedPeakDemand || 200;
  const planningReserve = expectedCapacity - expectedPeak;

  return {
    derated: Math.round(totalDerated * 10) / 10,
    available: Math.round(totalAvailable * 10) / 10,
    availability: Math.round((totalAvailable / totalDerated) * 1000) / 10,
    solar: totalSolar,
    totalDBIS: Math.round(totalDBIS * 10) / 10,
    actualPeak: Math.round(actualPeak * 10) / 10,
    expectedPeak,
    expectedCapacity: Math.round(expectedCapacity * 10) / 10,
    reserve: Math.round(actualReserve * 10) / 10,
    planningReserve: Math.round(planningReserve * 10) / 10,
    offlineCount,
    criticalCount,
    degradedCount,
    stationsBelowCapacity,
    issueCount: offlineCount + criticalCount,
  };
};

// Compute MoM % change badge
const momBadge = (curr: number | undefined, prev: number | undefined): { badge?: string; badgeColor?: GridMetric['badgeColor'] } => {
  if (curr == null || prev == null || prev === 0) return {};
  const pct = Math.round(((curr - prev) / prev) * 100);
  if (pct === 0) return {};
  const arrow = pct > 0 ? '\u2191' : '\u2193';
  // For complaints: up = bad (red), down = good (green)
  // For resolution/timeline: up = good (green), down = bad (red)
  return { badge: `${arrow}${Math.abs(pct)}%`, badgeColor: undefined }; // caller sets color
};

// Build GWI grid metrics from Supabase monthly report data
const buildGWIGridMetrics = (report: any, prevReport: any): GridMetric[] | undefined => {
  if (!report) return undefined;
  const cs = report.customer_service_data || {};
  const prevCs = prevReport?.customer_service_data || {};

  const complaintsMom = momBadge(cs.total_complaints, prevCs.total_complaints);
  const resMom = momBadge(cs.resolution_rate_pct, prevCs.resolution_rate_pct);
  const tlMom = momBadge(cs.within_timeline_pct, prevCs.within_timeline_pct);

  const coll = report.collections_data || {};

  const totalCollections = (coll as any).total_collections || 673700000;
  const formattedCollections = totalCollections >= 1e9
    ? `$${(totalCollections / 1e9).toFixed(1)}B`
    : `$${(totalCollections / 1e6).toFixed(1)}M`;

  const prevColl = prevReport?.collections_data || {};
  const collMom = momBadge((coll as any).total_collections, (prevColl as any).total_collections);

  return [
    {
      label: 'Collections',
      value: formattedCollections,
      badge: collMom.badge,
      badgeColor: collMom.badge?.startsWith('\u2191') ? 'green' : collMom.badge ? 'red' : undefined,
    },
    {
      label: 'Complaints',
      value: (cs.total_complaints || 2364).toLocaleString(),
      badge: complaintsMom.badge,
      badgeColor: complaintsMom.badge?.startsWith('\u2191') ? 'red' : complaintsMom.badge ? 'green' : undefined,
    },
    {
      label: 'Resolution',
      value: `${cs.resolution_rate_pct || 90}%`,
      badge: resMom.badge || ((cs.resolution_rate_pct || 90) >= 85 ? 'good' : 'low'),
      badgeColor: resMom.badge
        ? (resMom.badge.startsWith('\u2191') ? 'green' : 'red')
        : ((cs.resolution_rate_pct || 90) >= 85 ? 'green' : 'amber'),
    },
    {
      label: 'In Timeline',
      value: `${cs.within_timeline_pct || 70}%`,
      badge: tlMom.badge || ((cs.within_timeline_pct || 70) >= 80 ? 'good' : 'low'),
      badgeColor: tlMom.badge
        ? (tlMom.badge.startsWith('\u2191') ? 'green' : 'red')
        : ((cs.within_timeline_pct || 70) >= 80 ? 'green' : 'amber'),
    },
    {
      label: 'Accounts',
      value: ((coll as any).active_accounts || 189840).toLocaleString(),
    },
    {
      label: 'NRW',
      value: '63%',
    },
  ];
};

// Build GPL grid metrics from power station data
const buildGPLGridMetrics = (data: GPLData | null): GridMetric[] | undefined => {
  const summary = computeGPLSummary(data);
  if (!summary || !data) return undefined;

  const totalStations = data.powerStations.length;
  const onlineStations = data.powerStations.filter(s => s.available > 0).length;

  const reserveMarginPct = summary.totalDBIS > 0
    ? Math.round(((summary.totalDBIS - summary.actualPeak) / summary.totalDBIS) * 1000) / 10
    : 0;

  return [
    {
      label: 'Avail. Capacity',
      value: `${summary.available}/${summary.totalDBIS} MW`,
    },
    {
      label: 'Reserve Margin',
      value: `${reserveMarginPct}%`,
      badge: reserveMarginPct >= 20 ? 'healthy' : reserveMarginPct >= 10 ? 'tight' : 'deficit',
      badgeColor: reserveMarginPct >= 20 ? 'green' : reserveMarginPct >= 10 ? 'amber' : 'red',
    },
    {
      label: 'Stations Online',
      value: `${onlineStations}/${totalStations}`,
      badge: onlineStations < totalStations ? `${totalStations - onlineStations} off` : undefined,
      badgeColor: onlineStations < totalStations ? 'red' : undefined,
    },
    {
      label: 'System Losses',
      value: data.forcedOutageRate != null ? `${data.forcedOutageRate}%` : 'N/A',
      badge: data.forcedOutageRate != null && data.forcedOutageRate > 25 ? 'high' : undefined,
      badgeColor: data.forcedOutageRate != null && data.forcedOutageRate > 25 ? 'red' : undefined,
    },
    {
      label: 'Collection Rate',
      value: 'N/A',
      badgeColor: undefined,
    },
    {
      label: 'Peak Demand',
      value: `${summary.actualPeak} MW`,
    },
  ];
};

// Build CJIA grid metrics from passenger data
const buildCJIAGridMetrics = (data: CJIAData): GridMetric[] | undefined => {
  if (!data) return undefined;

  return [
    {
      label: 'Passengers MTD',
      value: data.mtdTotal?.toLocaleString() || '-',
      badge: data.mtdYoyChange ? `\u2191${data.mtdYoyChange}% YoY` : undefined,
      badgeColor: data.mtdYoyChange > 0 ? 'green' : 'red',
    },
    {
      label: 'On-Time',
      value: `${data.onTimePercent}%`,
      badge: data.onTimePercent >= 85 ? 'good' : 'low',
      badgeColor: data.onTimePercent >= 85 ? 'green' : 'amber',
    },
    {
      label: 'Daily Flights',
      value: `${data.dailyFlights}`,
      badge: `${data.internationalPercent}% intl`,
      badgeColor: 'blue',
    },
    {
      label: 'Safety',
      value: data.safetyIncidents === 0 ? '0 incidents' : `${data.safetyIncidents} incident${data.safetyIncidents > 1 ? 's' : ''}`,
      badge: data.safetyIncidents === 0 ? 'clear' : undefined,
      badgeColor: data.safetyIncidents === 0 ? 'green' : 'red',
    },
  ];
};

// Build GCAA grid metrics
const buildGCAAGridMetrics = (data: GCAAData): GridMetric[] | undefined => {
  if (!data) return undefined;

  const progressPct = data.inspectionsTarget > 0
    ? Math.round((data.inspectionsMTD / data.inspectionsTarget) * 100)
    : 0;

  return [
    {
      label: 'Compliance',
      value: `${data.complianceRate}%`,
      badge: data.complianceRate >= 90 ? 'good' : 'low',
      badgeColor: data.complianceRate >= 90 ? 'green' : 'amber',
    },
    {
      label: 'Inspections',
      value: `${data.inspectionsMTD}/${data.inspectionsTarget}`,
      badge: `${progressPct}%`,
      badgeColor: progressPct >= 75 ? 'green' : progressPct >= 50 ? 'amber' : 'red',
    },
    {
      label: 'Aircraft',
      value: `${data.activeRegistrations}`,
    },
    {
      label: 'Pending Certs',
      value: `${data.pendingCertifications}`,
      badge: data.pendingCertifications > 5 ? 'backlog' : undefined,
      badgeColor: data.pendingCertifications > 5 ? 'amber' : undefined,
    },
  ];
};

const getAgencyStatus = (id: string, data: any) => {
  switch (id) {
    case 'cjia':
      return data.safetyIncidents === 0 && data.onTimePercent >= 85
        ? { type: 'good' as const, text: 'Operational' }
        : { type: 'warning' as const, text: 'Attention' };
    case 'gwi':
      if (data.nrwPercent > 55) return { type: 'critical' as const, text: 'Critical' };
      if (data.activeDisruptions > 2) return { type: 'warning' as const, text: 'Disruptions' };
      return { type: 'good' as const, text: 'Operational' };
    case 'gpl': {
      const summary = computeGPLSummary(data);
      if (!summary) return { type: 'good' as const, text: 'Unknown' };
      if (summary.reserve < 0) return { type: 'critical' as const, text: 'Deficit' };
      if (summary.criticalCount > 2) return { type: 'warning' as const, text: 'Degraded' };
      if (summary.reserve < 20) return { type: 'warning' as const, text: 'Tight Margin' };
      return { type: 'good' as const, text: 'Operational' };
    }
    case 'gcaa':
      return data.complianceRate >= 90
        ? { type: 'good' as const, text: 'Compliant' }
        : { type: 'warning' as const, text: 'Review' };
    default:
      return { type: 'good' as const, text: 'Unknown' };
  }
};

const getAgencyMetrics = (id: string, data: any) => {
  switch (id) {
    case 'cjia':
      return [
        { label: 'Passengers MTD', value: data.mtdTotal?.toLocaleString(), highlight: true },
        { label: 'YoY Growth', value: `+${data.mtdYoyChange}%`, status: 'good' as const },
        { label: '2025 Passengers', value: data.annual2025Total?.toLocaleString() },
      ];
    case 'gwi':
      return [
        { label: 'NRW', value: `${data.nrwPercent}%`, highlight: true, status: (data.nrwPercent > 50 ? 'critical' : 'good') as 'critical' | 'good' },
        { label: 'Disruptions', value: data.activeDisruptions, status: (data.activeDisruptions > 2 ? 'warning' : 'good') as 'warning' | 'good' },
        { label: 'Response Time', value: `${data.avgResponseTime} hrs` },
      ];
    case 'gpl': {
      const summary = computeGPLSummary(data);
      if (!summary) {
        return [
          { label: 'System Load', value: 'No data', highlight: true },
          { label: 'Availability', value: '-' },
          { label: 'Total DBIS', value: '-' },
        ];
      }
      return [
        { label: 'System Load', value: `${summary.actualPeak}/${summary.totalDBIS} MW`, highlight: true },
        {
          label: 'Availability',
          value: `${summary.availability}%`,
          status: (summary.availability >= 80 ? 'good' : summary.availability >= 70 ? 'warning' : 'critical') as 'good' | 'warning' | 'critical',
        },
        {
          label: 'Reserve',
          value: `${summary.reserve > 0 ? '+' : ''}${summary.reserve} MW`,
          status: (summary.reserve >= 30 ? 'good' : summary.reserve >= 0 ? 'warning' : 'critical') as 'good' | 'warning' | 'critical',
        },
      ];
    }
    case 'gcaa':
      return [
        { label: 'Aircraft', value: data.activeRegistrations, highlight: true },
        { label: 'Inspections', value: `${data.inspectionsMTD}/${data.inspectionsTarget}` },
        { label: 'Compliance', value: `${data.complianceRate}%` },
      ];
    default:
      return [];
  }
};

const getAgencyTrend = (id: string, data: any): number | null => {
  switch (id) {
    case 'cjia': return data.mtdYoyChange;
    case 'gwi': return data.responseTimeTrend;
    case 'gpl': return null;
    case 'gcaa': return null;
    default: return null;
  }
};

const getAgencyWarningBadge = (id: string, data: any) => {
  switch (id) {
    case 'gpl': {
      const summary = computeGPLSummary(data);
      if (!summary) return null;
      if (summary.stationsBelowCapacity > 0) {
        return {
          count: summary.stationsBelowCapacity,
          text: `${summary.stationsBelowCapacity} station${summary.stationsBelowCapacity > 1 ? 's' : ''} below capacity`,
          severity: (summary.criticalCount > 0 || summary.offlineCount > 0 ? 'critical' : 'warning') as 'critical' | 'warning',
        };
      }
      return null;
    }
    case 'gwi': {
      if (data.activeDisruptions > 0) {
        return {
          count: data.activeDisruptions,
          text: `${data.activeDisruptions} active disruption${data.activeDisruptions > 1 ? 's' : ''}`,
          severity: (data.activeDisruptions > 2 ? 'warning' : 'info') as 'warning' | 'info',
        };
      }
      return null;
    }
    default:
      return null;
  }
};

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

export const useAgencyData = () => {
  const [rawData, setRawData] = useState<AgencyRawData>(generateAgencyData());
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [isLoading, setIsLoading] = useState(false);
  const [gwiReport, setGwiReport] = useState<any>(null);
  const [gwiPrevReport, setGwiPrevReport] = useState<any>(null);
  const [gwiInsightsScore, setGwiInsightsScore] = useState<number | null>(null);
  const [delayedCounts, setDelayedCounts] = useState<DelayedCounts | null>(null);

  const fetchGPLData = useCallback(async (date?: string) => {
    try {
      const url = date ? `/api/gpl/daily/${date}` : '/api/gpl/latest';
      const response = await fetch(url);
      if (!response.ok) {
        if (response.status === 404) return null; // No data for this date
        console.warn('Failed to fetch GPL data:', response.status);
        return null;
      }
      const json = await response.json();

      // Unwrap: API returns { success, data: { upload, summary, stations, analysis? } }
      const payload = json?.data;
      if (!payload) return null;

      const { upload, summary, stations } = payload;

      // Use analysis from payload if included, otherwise fetch separately
      let analysis = payload.analysis || null;
      if (!analysis && upload?.id) {
        try {
          const analysisResponse = await fetch(`/api/gpl/analysis/${upload.id}`);
          if (analysisResponse.ok) {
            const analysisJson = await analysisResponse.json();
            // Unwrap: { success, data: { analysis: { executiveBriefing, ... } } }
            analysis = analysisJson?.data?.analysis || analysisJson?.analysis || null;
          }
        } catch (err) {
          console.warn('Failed to fetch AI analysis:', err);
        }
      }

      return transformGPLData({ summary, stations, analysis });
    } catch (err) {
      console.warn('Error fetching GPL data:', err);
      return null;
    }
  }, []);

  const fetchGWIReport = useCallback(async () => {
    try {
      const res = await fetch('/api/gwi/report/latest');
      if (!res.ok) return null;
      const json = await res.json();
      return { current: json.data || null, previous: json.previous || null };
    } catch {
      return null;
    }
  }, []);

  const fetchGWIInsightsScore = useCallback(async (): Promise<number | null> => {
    try {
      const res = await fetch('/api/gwi/insights/latest');
      if (!res.ok) return null;
      const json = await res.json();
      return json.data?.overall?.health_score ?? null;
    } catch {
      return null;
    }
  }, []);

  const fetchDelayedCounts = useCallback(async (): Promise<DelayedCounts | null> => {
    try {
      const res = await fetch('/api/projects/delayed-counts');
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);

    const [gplData, gwiData, insightsScore, delayed] = await Promise.all([
      fetchGPLData(),
      fetchGWIReport(),
      fetchGWIInsightsScore(),
      fetchDelayedCounts(),
    ]);
    const mockData = generateAgencyData();

    if (gwiData) {
      setGwiReport(gwiData.current);
      setGwiPrevReport(gwiData.previous);
    }
    setGwiInsightsScore(insightsScore);
    if (delayed) setDelayedCounts(delayed);

    setRawData({
      ...mockData,
      gpl: gplData || mockData.gpl,
    });

    setLastUpdated(new Date());
    setIsLoading(false);
  }, [fetchGPLData, fetchGWIReport, fetchGWIInsightsScore, fetchDelayedCounts]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const agencies = Object.keys(AGENCY_CONFIG).map(id => {
    const config = AGENCY_CONFIG[id];
    const data = rawData[id as keyof AgencyRawData];

    // Compute health score
    const health = id === 'gpl' ? computeGPLHealth(rawData.gpl)
      : id === 'gwi' ? computeGWIHealth(gwiReport, gwiInsightsScore)
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
          badge: count > 0 ? `⚠ ${count} overdue` : '0 delayed ✓',
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
  });

  const gplSummary = computeGPLSummary(rawData.gpl);

  const alerts = [
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
  ];

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
