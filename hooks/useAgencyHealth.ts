'use client';

import type { GPLData, CJIAData, GWIData, GCAAData } from '@/data/mockData';
import type { GridMetric } from '@/components/intel/AgencyCard';
import { computeGPLSummary } from './useGPLData';

type AgencyData = GPLData | CJIAData | GWIData | GCAAData;

// ── Status helpers ───────────────────────────────────────────────────────────

export const getAgencyStatus = (id: string, data: AgencyData) => {
  switch (id) {
    case 'cjia': {
      const cjia = data as CJIAData;
      return cjia.safetyIncidents === 0 && cjia.onTimePercent >= 85
        ? { type: 'good' as const, text: 'Operational' }
        : { type: 'warning' as const, text: 'Attention' };
    }
    case 'gwi': {
      const gwi = data as GWIData;
      if (gwi.nrwPercent > 55) return { type: 'critical' as const, text: 'Critical' };
      if (gwi.activeDisruptions > 2) return { type: 'warning' as const, text: 'Disruptions' };
      return { type: 'good' as const, text: 'Operational' };
    }
    case 'gpl': {
      const summary = computeGPLSummary(data as GPLData);
      if (!summary) return { type: 'good' as const, text: 'Unknown' };
      if (summary.reserve < 0) return { type: 'critical' as const, text: 'Deficit' };
      if (summary.criticalCount > 2) return { type: 'warning' as const, text: 'Degraded' };
      if (summary.reserve < 20) return { type: 'warning' as const, text: 'Tight Margin' };
      return { type: 'good' as const, text: 'Operational' };
    }
    case 'gcaa': {
      const gcaa = data as GCAAData;
      return gcaa.complianceRate >= 90
        ? { type: 'good' as const, text: 'Compliant' }
        : { type: 'warning' as const, text: 'Review' };
    }
    default:
      return { type: 'good' as const, text: 'Unknown' };
  }
};

// ── Metrics helpers ──────────────────────────────────────────────────────────

export const getAgencyMetrics = (id: string, data: AgencyData) => {
  switch (id) {
    case 'cjia': {
      const cjia = data as CJIAData;
      return [
        { label: 'Passengers MTD', value: cjia.mtdTotal?.toLocaleString(), highlight: true },
        { label: 'YoY Growth', value: `+${cjia.mtdYoyChange}%`, status: 'good' as const },
        { label: '2025 Passengers', value: cjia.annual2025Total?.toLocaleString() },
      ];
    }
    case 'gwi': {
      const gwi = data as GWIData;
      return [
        { label: 'NRW', value: `${gwi.nrwPercent}%`, highlight: true, status: (gwi.nrwPercent > 50 ? 'critical' : 'good') as 'critical' | 'good' },
        { label: 'Disruptions', value: gwi.activeDisruptions, status: (gwi.activeDisruptions > 2 ? 'warning' : 'good') as 'warning' | 'good' },
        { label: 'Response Time', value: `${gwi.avgResponseTime} hrs` },
      ];
    }
    case 'gpl': {
      const summary = computeGPLSummary(data as GPLData);
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
    case 'gcaa': {
      const gcaa = data as GCAAData;
      return [
        { label: 'Aircraft', value: gcaa.activeRegistrations, highlight: true },
        { label: 'Inspections', value: `${gcaa.inspectionsMTD}/${gcaa.inspectionsTarget}` },
        { label: 'Compliance', value: `${gcaa.complianceRate}%` },
      ];
    }
    default:
      return [];
  }
};

// ── Trend helpers ────────────────────────────────────────────────────────────

export const getAgencyTrend = (id: string, data: AgencyData): number | null => {
  switch (id) {
    case 'cjia': return (data as CJIAData).mtdYoyChange;
    case 'gwi': return (data as GWIData).responseTimeTrend;
    case 'gpl': return null;
    case 'gcaa': return null;
    default: return null;
  }
};

// ── Warning badge helpers ────────────────────────────────────────────────────

export const getAgencyWarningBadge = (id: string, data: AgencyData) => {
  switch (id) {
    case 'gpl': {
      const summary = computeGPLSummary(data as GPLData);
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
      const gwi = data as GWIData;
      if (gwi.activeDisruptions > 0) {
        return {
          count: gwi.activeDisruptions,
          text: `${gwi.activeDisruptions} active disruption${gwi.activeDisruptions > 1 ? 's' : ''}`,
          severity: (gwi.activeDisruptions > 2 ? 'warning' : 'info') as 'warning' | 'info',
        };
      }
      return null;
    }
    default:
      return null;
  }
};

// ── Grid metrics builders ────────────────────────────────────────────────────

export const buildGPLGridMetrics = (data: GPLData | null): GridMetric[] | undefined => {
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

export const buildCJIAGridMetrics = (data: CJIAData): GridMetric[] | undefined => {
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

export const buildGCAAGridMetrics = (data: GCAAData): GridMetric[] | undefined => {
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
