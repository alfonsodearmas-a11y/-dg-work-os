'use client';

import { useCallback } from 'react';
import type { GPLData } from '@/data/mockData';
import { fetchWithOffline } from '@/lib/offline/sync-manager';
import { API_PATHS } from '@/lib/constants/api-paths';

interface GPLApiStation {
  station?: string;
  total_units?: string | number;
  units_online?: string | number;
  total_derated_capacity_mw?: string | number;
  total_available_mw?: string | number;
}

interface GPLApiSummary {
  report_date?: string;
  hampshire_solar_mwp?: string | number;
  solar_hampshire_mwp?: string | number;
  prospect_solar_mwp?: string | number;
  solar_prospect_mwp?: string | number;
  trafalgar_solar_mwp?: string | number;
  solar_trafalgar_mwp?: string | number;
  total_renewable_mwp?: string | number;
  average_for?: string | number;
  expected_peak_demand_mw?: string | number;
  evening_peak_on_bars_mw?: string | number;
  evening_peak_suppressed_mw?: string | number;
  day_peak_on_bars_mw?: string | number;
  day_peak_suppressed_mw?: string | number;
}

interface GPLApiAnalysis {
  analysis_data?: Record<string, unknown>;
  [key: string]: unknown;
}

interface GPLApiPayload {
  upload?: { id: string };
  summary?: GPLApiSummary;
  stations?: GPLApiStation[];
  analysis?: GPLApiAnalysis | null;
}

interface GPLApiResponse {
  success?: boolean;
  data?: GPLApiPayload;
}

// Transform API response to match expected GPL data structure
const transformGPLData = (apiData: { summary: GPLApiSummary; stations: GPLApiStation[]; analysis?: GPLApiAnalysis | null }): GPLData | null => {
  if (!apiData?.stations || !apiData?.summary) {
    return null;
  }

  const { summary, stations, analysis } = apiData;

  const powerStations = stations.map((station: GPLApiStation) => {
    const stationName = String(station.station || 'Unknown');
    return {
      code: stationName.toUpperCase().replace(/\s+/g, '_'),
      name: stationName,
      type: 'fossil' as const,
      units: parseInt(String(station.total_units)) || 0,
      onlineUnits: parseInt(String(station.units_online)) || 0,
      derated: parseFloat(String(station.total_derated_capacity_mw)) || 0,
      available: parseFloat(String(station.total_available_mw)) || 0,
    };
  });

  const solarStations = [
    { name: 'Hampshire Solar', capacity: parseFloat(String(summary.hampshire_solar_mwp ?? summary.solar_hampshire_mwp)) || 0 },
    { name: 'Prospect Solar', capacity: parseFloat(String(summary.prospect_solar_mwp ?? summary.solar_prospect_mwp)) || 0 },
    { name: 'Trafalgar Solar', capacity: parseFloat(String(summary.trafalgar_solar_mwp ?? summary.solar_trafalgar_mwp)) || 0 },
  ].filter(s => s.capacity > 0);

  return {
    source: 'API',
    capacityDate: summary.report_date || '',
    peakDemandDate: summary.report_date || '',
    powerStations,
    solarStations,
    totalRenewableCapacity: parseFloat(String(summary.total_renewable_mwp)) || 0,
    forcedOutageRate: parseFloat(String(summary.average_for)) * 100 || 7.5,
    expectedPeakDemand: parseFloat(String(summary.expected_peak_demand_mw)) || 200,
    actualEveningPeak: {
      onBars: parseFloat(String(summary.evening_peak_on_bars_mw)) || 0,
      suppressed: parseFloat(String(summary.evening_peak_suppressed_mw)) || 0,
    },
    actualDayPeak: {
      onBars: parseFloat(String(summary.day_peak_on_bars_mw)) || 0,
      suppressed: parseFloat(String(summary.day_peak_suppressed_mw)) || 0,
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

/**
 * Compute GPL summary from power station data.
 * Exported so other modules (e.g. useAgencyHealth) can use it without importing the full hook.
 */
export const computeGPLSummary = (data: GPLData | null) => {
  if (!data?.powerStations) return null;

  const stations = data.powerStations;
  const totalDerated = stations.reduce((sum, s) => sum + s.derated, 0);
  const totalAvailable = stations.reduce((sum, s) => sum + s.available, 0);

  const stationStatuses = stations.map(s => {
    if (s.available === 0) return 'offline';
    if (s.available / s.derated < 0.5) return 'critical';
    if (s.available / s.derated < 0.7) return 'degraded';
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
    availability: Math.min(Math.round((totalAvailable / totalDerated) * 1000) / 10, 100),
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

/**
 * Hook for fetching GPL-specific data from the API.
 * Returns a stable fetchGPLData callback that can be called with an optional date.
 */
export const useGPLData = () => {
  const fetchGPLData = useCallback(async (date?: string): Promise<GPLData | null> => {
    try {
      const url = date ? API_PATHS.GPL_DAILY(date) : API_PATHS.GPL_LATEST;
      const cacheKey = date ? `gpl-daily-${date}` : 'gpl-latest';
      const result = await fetchWithOffline<GPLApiResponse>(url, 'agency-data', cacheKey);
      const json = result.data;

      // Unwrap: API returns { success, data: { upload, summary, stations, analysis? } }
      const payload = json?.data;
      if (!payload?.summary || !payload?.stations) return null;

      const { upload, summary, stations } = payload;

      // Use analysis from payload if included, otherwise fetch separately
      let analysis: GPLApiAnalysis | null = payload.analysis || null;
      if (!analysis && upload?.id && navigator.onLine) {
        try {
          const analysisResponse = await fetch(API_PATHS.GPL_ANALYSIS(upload.id));
          if (analysisResponse.ok) {
            const analysisJson = await analysisResponse.json() as { data?: { analysis?: GPLApiAnalysis }; analysis?: GPLApiAnalysis };
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

  return { fetchGPLData };
};
