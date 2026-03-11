'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { useIsMobile } from '@/hooks/useIsMobile';
import { Upload } from 'lucide-react';
import type { GPLData } from '@/data/mockData';
import { computeGPLHealth } from '@/lib/agency-health';
import { GPLExcelUpload } from './GPLExcelUpload';
import type { GPLSummary, EnrichedStation, KpiState, ConsolidatedAlert, GPLHealthResult } from './gpl/gpl-types';

// Tab components
import { GPLSummaryCard } from './gpl/GPLSummaryCard';
import { GPLOverviewTab } from './gpl/GPLOverviewTab';
import { GPLStationsTab } from './gpl/GPLStationsTab';
import { GPLKpiTab } from './gpl/GPLKpiTab';
import { GPLForecastTab } from './gpl/GPLForecastTab';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = '/api';
const TAB_IDS = ['overview', 'stations', 'trends', 'forecast'] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GPLDetailProps {
  data: GPLData;
  onLoadDate?: (date: string) => Promise<GPLData | null>;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function GPLDetail({ data, onLoadDate }: GPLDetailProps) {
  // Tab state
  const [activeTab, setActiveTab] = useState<string>('overview');

  // Swipe gesture for mobile tab navigation
  const isMobile = useIsMobile();

  const handleSwipeLeft = useCallback(() => {
    setActiveTab(prev => {
      const idx = TAB_IDS.indexOf(prev as typeof TAB_IDS[number]);
      return idx < TAB_IDS.length - 1 ? TAB_IDS[idx + 1] : prev;
    });
  }, []);

  const handleSwipeRight = useCallback(() => {
    setActiveTab(prev => {
      const idx = TAB_IDS.indexOf(prev as typeof TAB_IDS[number]);
      return idx > 0 ? TAB_IDS[idx - 1] : prev;
    });
  }, []);

  const swipeRef = useSwipeGesture<HTMLDivElement>({
    onSwipeLeft: handleSwipeLeft,
    onSwipeRight: handleSwipeRight,
    enabled: isMobile,
  });

  // History state
  const [historyDates, setHistoryDates] = useState<{ reportDate: string; fileName: string; createdAt: string }[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [historyLoading, setHistoryLoading] = useState(false);

  // KPI data state
  const [kpiData, setKpiData] = useState<KpiState>({ latest: null, trends: [], analysis: null });
  const [kpiLoading, setKpiLoading] = useState(true);

  // Forecast data state (legacy + multivariate -- kept for computedProjections fallback)
  const [forecastData, setForecastData] = useState<any>(null);
  const [forecastLoading, setForecastLoading] = useState(true);
  const [multiForecast, setMultiForecast] = useState<any>(null);
  const [multiForecastLoading, setMultiForecastLoading] = useState(true);
  const [refreshingForecast, setRefreshingForecast] = useState(false);

  // Enhanced forecast state (Claude Opus)
  const [enhancedForecast, setEnhancedForecast] = useState<any>(null);
  const [enhancedLoading, setEnhancedLoading] = useState(true);
  const [enhancedRegenerating, setEnhancedRegenerating] = useState(false);
  const [enhancedCached, setEnhancedCached] = useState(false);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  // Fetch KPI data
  useEffect(() => {
    const controller = new AbortController();
    async function fetchKpiData() {
      setKpiLoading(true);
      try {
        const [latestRes, trendsRes, analysisRes] = await Promise.all([
          fetch(`${API_BASE}/gpl/kpi/latest`, { signal: controller.signal }),
          fetch(`${API_BASE}/gpl/kpi/trends?months=12`, { signal: controller.signal }),
          fetch(`${API_BASE}/gpl/kpi/analysis`, { signal: controller.signal })
        ]);
        const [latestData, trendsData, analysisData] = await Promise.all([
          latestRes.json(), trendsRes.json(), analysisRes.json()
        ]);
        if (!controller.signal.aborted) {
          setKpiData({
            latest: latestData.success && latestData.hasData ? latestData : null,
            trends: trendsData.success ? trendsData.trends : [],
            analysis: analysisData.success && analysisData.hasAnalysis ? analysisData.analysis : null
          });
        }
      } catch (err) {
        if (!controller.signal.aborted) console.error('Failed to fetch KPI data:', err);
      } finally {
        if (!controller.signal.aborted) setKpiLoading(false);
      }
    }
    fetchKpiData();
    return () => controller.abort();
  }, []);

  // Fetch forecast data (legacy + multivariate)
  useEffect(() => {
    const controller = new AbortController();
    async function fetchForecastData() {
      setForecastLoading(true);
      setMultiForecastLoading(true);
      try {
        const [legacyRes, multiRes] = await Promise.all([
          fetch(`${API_BASE}/gpl/forecast/all`, { signal: controller.signal }),
          fetch(`${API_BASE}/gpl/forecast/multivariate`, { signal: controller.signal })
        ]);
        const [legacyData, multiData] = await Promise.all([
          legacyRes.json(),
          multiRes.json()
        ]);

        if (!controller.signal.aborted) {
          if (legacyData.success) setForecastData(legacyData.data);
          if (multiData.success && multiData.hasData) setMultiForecast(multiData.forecast);
        }
      } catch (err) {
        if (!controller.signal.aborted) console.error('Failed to fetch forecast data:', err);
      } finally {
        if (!controller.signal.aborted) {
          setForecastLoading(false);
          setMultiForecastLoading(false);
        }
      }
    }
    fetchForecastData();
    return () => controller.abort();
  }, []);

  // Fetch enhanced forecast (Claude Opus)
  useEffect(() => {
    const controller = new AbortController();
    async function fetchEnhancedForecast() {
      setEnhancedLoading(true);
      try {
        const res = await fetch(`${API_BASE}/gpl/forecast/enhanced`, { signal: controller.signal });
        const json = await res.json();
        if (!controller.signal.aborted && json.success && json.forecast) {
          setEnhancedForecast(json.forecast);
          setEnhancedCached(json.cached ?? false);
        }
      } catch (err) {
        if (!controller.signal.aborted) console.error('Failed to fetch enhanced forecast:', err);
      } finally {
        if (!controller.signal.aborted) setEnhancedLoading(false);
      }
    }
    fetchEnhancedForecast();
    return () => controller.abort();
  }, []);

  // Fetch report history for date picker
  useEffect(() => {
    async function fetchHistory() {
      try {
        const res = await fetch(`${API_BASE}/gpl/history?limit=30`);
        const json = await res.json();
        if (json.success && json.data?.uploads) {
          setHistoryDates(
            json.data.uploads
              .filter((u: any) => u.status === 'confirmed')
              .map((u: any) => ({
                reportDate: u.reportDate,
                fileName: u.fileName,
                createdAt: u.createdAt,
              }))
          );
          if (data.reportDate) {
            setSelectedDate(data.reportDate);
          }
        }
      } catch (err) {
        console.warn('Failed to fetch GPL history:', err);
      }
    }
    fetchHistory();
  }, [data.reportDate]);

  // ---------------------------------------------------------------------------
  // Callbacks
  // ---------------------------------------------------------------------------

  const handleDateChange = useCallback(async (date: string) => {
    if (!date || date === selectedDate || !onLoadDate) return;
    setHistoryLoading(true);
    setSelectedDate(date);
    await onLoadDate(date);
    setHistoryLoading(false);
  }, [selectedDate, onLoadDate]);

  const handleRefreshForecast = useCallback(async () => {
    setRefreshingForecast(true);
    try {
      const response = await fetch(`${API_BASE}/gpl/forecast/multivariate/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const result = await response.json();
      if (result.success) setMultiForecast(result.forecast);

      const legacyResponse = await fetch(`${API_BASE}/gpl/forecast/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ includeAI: false })
      });
      const legacyResult = await legacyResponse.json();
      if (legacyResult.success) {
        const refreshed = await fetch(`${API_BASE}/gpl/forecast/all`);
        const refreshedData = await refreshed.json();
        if (refreshedData.success) setForecastData(refreshedData.data);
      }
    } catch (err) {
      console.error('Failed to refresh forecasts:', err);
    } finally {
      setRefreshingForecast(false);
    }
  }, []);

  const handleRegenerateEnhanced = useCallback(async () => {
    setEnhancedRegenerating(true);
    try {
      const res = await fetch(`${API_BASE}/gpl/forecast/enhanced`, { method: 'POST' });
      const json = await res.json();
      if (json.success && json.forecast) {
        setEnhancedForecast(json.forecast);
        setEnhancedCached(false);
      }
    } catch (err) {
      console.error('Failed to regenerate enhanced forecast:', err);
    } finally {
      setEnhancedRegenerating(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Computed values
  // ---------------------------------------------------------------------------

  // Compute station metrics from raw data
  const summary = useMemo<GPLSummary | null>(() => {
    if (!data?.powerStations) return null;

    const stations = data.powerStations;
    const totalDerated = stations.reduce((sum, s) => sum + s.derated, 0);
    const totalAvailable = stations.reduce((sum, s) => sum + s.available, 0);
    const totalUnits = stations.reduce((sum, s) => sum + s.units, 0);

    const enrichedStations: EnrichedStation[] = stations.map(s => ({
      ...s,
      availability: s.derated > 0 ? (s.available / s.derated) * 100 : 0,
      status: s.available === 0 ? 'offline' as const
            : s.available / s.derated < 0.5 ? 'critical' as const
            : s.available / s.derated < 0.7 ? 'degraded' as const
            : 'operational' as const,
    }));

    const totalSolar = data.solarStations?.reduce((sum, s) => sum + s.capacity, 0) || data.totalRenewableCapacity || 0;
    const totalDBIS = totalAvailable + totalSolar;

    return {
      totalDerated: Math.round(totalDerated * 10) / 10,
      totalAvailable: Math.round(totalAvailable * 10) / 10,
      totalOffline: Math.round((totalDerated - totalAvailable) * 10) / 10,
      availability: totalDerated > 0 ? Math.round((totalAvailable / totalDerated) * 1000) / 10 : 0,
      totalUnits,
      totalSolar,
      totalDBIS: Math.round(totalDBIS * 10) / 10,
      stations: enrichedStations,
      operational: enrichedStations.filter(s => s.status === 'operational'),
      degraded: enrichedStations.filter(s => s.status === 'degraded'),
      critical: enrichedStations.filter(s => s.status === 'critical'),
      offline: enrichedStations.filter(s => s.status === 'offline'),
    };
  }, [data]);

  // No data state
  if (!summary) {
    return (
      <div className="bg-navy-900 rounded-xl border border-navy-800 p-6 md:p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-navy-800 flex items-center justify-center mx-auto mb-4">
          <Upload className="w-8 h-8 text-navy-600" />
        </div>
        <h3 className="text-slate-100 text-lg font-semibold mb-2">No DBIS Data Available</h3>
        <p className="text-navy-600 text-base mb-6 max-w-md mx-auto">
          Upload a GPL DBIS Excel report to populate the dashboard with generation data, station status, and AI analysis.
        </p>
        <GPLExcelUpload onCancel={() => {}} />
      </div>
    );
  }

  // Derived values from summary
  const eveningPeak = data.actualEveningPeak?.onBars || 0;
  const reserveMargin = summary.totalDBIS > 0 ? ((summary.totalDBIS - eveningPeak) / summary.totalDBIS) * 100 : 0;
  const healthStatus: 'critical' | 'warning' | 'good' = reserveMargin < 10 ? 'critical' : reserveMargin < 15 ? 'warning' : 'good';
  const gplHealth = computeGPLHealth(data) as GPLHealthResult | null;

  // Consolidate alerts from AI analysis
  const consolidatedAlerts = useMemo<ConsolidatedAlert[]>(() => {
    const alerts: ConsolidatedAlert[] = [];

    const critAlerts = data.aiAnalysis?.criticalAlerts || data.aiAnalysis?.critical_alerts;
    if (critAlerts) {
      critAlerts.forEach((alert: any, i: number) => {
        alerts.push({
          id: `critical-${i}`,
          severity: 'critical',
          title: alert.title,
          station: null,
          detail: alert.description,
          recommendation: alert.recommendation
        });
      });
    }

    const concerns = data.aiAnalysis?.stationConcerns || data.aiAnalysis?.station_concerns;
    if (concerns) {
      concerns.forEach((concern: any, i: number) => {
        alerts.push({
          id: `station-${i}`,
          severity: concern.priority === 'HIGH' ? 'high' : concern.priority === 'MEDIUM' ? 'medium' : 'low',
          title: concern.issue,
          station: concern.station,
          detail: concern.impact || '',
          recommendation: null
        });
      });
    }

    if (data.aiAnalysis?.recommendations) {
      data.aiAnalysis.recommendations.forEach((rec: any, i: number) => {
        if (rec.urgency === 'Immediate') {
          alerts.push({
            id: `rec-${i}`,
            severity: 'medium',
            title: rec.recommendation,
            station: null,
            detail: null,
            recommendation: null,
            category: rec.category
          });
        }
      });
    }

    return alerts.sort((a, b) => {
      const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
    });
  }, [data.aiAnalysis]);

  const criticalCount = consolidatedAlerts.filter(a => a.severity === 'critical' || a.severity === 'high').length;

  // Tab definitions
  const tabs = useMemo(() => [
    { id: 'overview', label: 'Overview', fullLabel: 'System Overview' },
    { id: 'stations', label: 'Stations', fullLabel: 'Station Health' },
    { id: 'trends', label: 'KPIs', fullLabel: 'Trends & KPIs' },
    { id: 'forecast', label: 'Forecast', fullLabel: 'Forecast' },
  ], []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* PERSISTENT KPI STRIP */}
      <GPLSummaryCard
        data={data}
        summary={summary}
        gplHealth={gplHealth}
        healthStatus={healthStatus}
        reserveMargin={reserveMargin}
        eveningPeak={eveningPeak}
        historyDates={historyDates}
        selectedDate={selectedDate}
        historyLoading={historyLoading}
        onDateChange={handleDateChange}
      />

      {/* TAB BAR */}
      <div className="bg-navy-900 rounded-xl border border-navy-800 p-1.5">
        <div className="flex gap-1">
          {tabs.map(tab => (
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

      {/* TAB CONTENT */}
      <div ref={swipeRef} className="min-h-[400px]">
        {activeTab === 'overview' && (
          <GPLOverviewTab
            data={data}
            summary={summary}
            consolidatedAlerts={consolidatedAlerts}
            criticalCount={criticalCount}
          />
        )}

        {activeTab === 'stations' && (
          <GPLStationsTab summary={summary} />
        )}

        {activeTab === 'trends' && (
          <GPLKpiTab
            kpiData={kpiData}
            kpiLoading={kpiLoading}
          />
        )}

        {activeTab === 'forecast' && (
          <GPLForecastTab
            enhancedForecast={enhancedForecast}
            enhancedLoading={enhancedLoading}
            enhancedRegenerating={enhancedRegenerating}
            enhancedCached={enhancedCached}
            onRegenerateEnhanced={handleRegenerateEnhanced}
          />
        )}
      </div>
    </div>
  );
}

export default GPLDetail;
