'use client';

import { useCallback } from 'react';
import { fetchWithOffline } from '@/lib/offline/sync-manager';
import { API_PATHS } from '@/lib/constants/api-paths';
import type { GridMetric } from '@/components/intel/AgencyCard';
import { GWI_DEFAULT_TOTAL_COLLECTIONS, GWI_DEFAULT_ACTIVE_ACCOUNTS } from '@/lib/constants/config';

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

/**
 * Build GWI grid metrics from Supabase monthly report data.
 * Exported for use in useAgencyData facade.
 */
export const buildGWIGridMetrics = (report: any, prevReport: any): GridMetric[] | undefined => {
  if (!report) return undefined;
  const cs = report.customer_service_data || {};
  const prevCs = prevReport?.customer_service_data || {};

  const complaintsMom = momBadge(cs.total_complaints, prevCs.total_complaints);
  const resMom = momBadge(cs.resolution_rate_pct, prevCs.resolution_rate_pct);
  const tlMom = momBadge(cs.within_timeline_pct, prevCs.within_timeline_pct);

  const coll = report.collections_data || {};

  const totalCollections = (coll as any).total_collections || GWI_DEFAULT_TOTAL_COLLECTIONS;
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
      value: ((coll as any).active_accounts || GWI_DEFAULT_ACTIVE_ACCOUNTS).toLocaleString(),
    },
    {
      label: 'NRW',
      value: '63%',
    },
  ];
};

/**
 * Hook for fetching GWI-specific report data.
 * Returns a stable fetchGWIReport callback.
 */
export const useGWIData = () => {
  const fetchGWIReport = useCallback(async (): Promise<{ current: any; previous: any } | null> => {
    try {
      const result = await fetchWithOffline<any>(API_PATHS.GWI_REPORT_LATEST, 'agency-data', 'gwi-report');
      const json = result.data;
      return { current: json.data || null, previous: json.previous || null };
    } catch {
      return null;
    }
  }, []);

  return { fetchGWIReport };
};
