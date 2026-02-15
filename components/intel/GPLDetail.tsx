'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { useIsMobile } from '@/hooks/useIsMobile';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
  ReferenceLine, ComposedChart, PieChart, Pie, LabelList
} from 'recharts';
import {
  AlertTriangle, Zap, CheckCircle, Sun, Ship, Factory, TrendingDown,
  TrendingUp, Clock, Battery, ChevronDown, ChevronRight, Users,
  DollarSign, Upload, RefreshCw, Activity, Minus, Info, Calendar,
  Building2, Home, Thermometer
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { GPLData } from '@/data/mockData';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { InsightCard, INSIGHT_SEVERITY, type InsightCardData } from '@/components/ui/InsightCard';
import { HealthScoreTooltip } from '@/components/ui/HealthScoreTooltip';
import { HealthBreakdownSection } from '@/components/ui/HealthBreakdownSection';
import { computeGPLHealth } from '@/lib/agency-health';
import { GPLMonthlyKpi } from './GPLMonthlyKpi';
import { GPLExcelUpload } from './GPLExcelUpload';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const API_BASE = '/api';

interface GPLDetailProps {
  data: GPLData;
  onLoadDate?: (date: string) => Promise<GPLData | null>;
}

interface EnrichedStation {
  name: string;
  units: number;
  derated: number;
  available: number;
  availability: number;
  status: 'operational' | 'degraded' | 'critical' | 'offline';
}

interface GPLSummary {
  totalDerated: number;
  totalAvailable: number;
  totalOffline: number;
  availability: number;
  totalUnits: number;
  totalSolar: number;
  totalDBIS: number;
  stations: EnrichedStation[];
  operational: EnrichedStation[];
  degraded: EnrichedStation[];
  critical: EnrichedStation[];
  offline: EnrichedStation[];
}

interface ConsolidatedAlert {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  station: string | null;
  detail: string | null;
  recommendation: string | null;
  category?: string;
}

interface KpiDataEntry {
  value: number;
  changePct: number | null;
  previousValue: number | null;
}

interface KpiState {
  latest: { success?: boolean; hasData?: boolean; kpis?: Record<string, KpiDataEntry> } | null;
  trends: any[];
  analysis: any;
}

interface ComputedProjections {
  currentDbis: number;
  currentEsq: number;
  dbis: { '6mo': number; '12mo': number; '24mo': number; growthRate: number };
  esq: { '6mo': number; '12mo': number; '24mo': number; growthRate: number };
  usingFallback: boolean;
  chartData: { period: string; dbis: number; esq: number }[];
  capacity: any[];
  loadShedding: any;
}

interface KpiSummaryCardProps {
  name: string;
  data: KpiDataEntry | undefined | null;
  icon: LucideIcon;
  unit: string;
  inverseGood?: boolean;
  target?: number;
}

interface ForecastMetricCardProps {
  title: string;
  value: number | string;
  unit?: string;
  isDate?: boolean;
  trend?: 'danger' | 'warning' | 'success' | 'normal';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KpiSummaryCard({ name, data, icon: Icon, unit, inverseGood = false, target }: KpiSummaryCardProps) {
  if (!data) return null;

  const isUp = (data.changePct ?? 0) > 0;
  const isGood = inverseGood ? !isUp : isUp;
  const atTarget = target != null && data.value >= target;

  return (
    <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] p-3 md:p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-[#2d3a52] flex items-center justify-center">
            <Icon className="w-5 h-5 text-[#94a3b8]" />
          </div>
          <span className="text-[#94a3b8] text-[15px]">{name}</span>
        </div>
        {data.changePct !== null && (
          <div className={`flex items-center gap-1 px-2 py-1 rounded ${isGood ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
            {isUp ? <TrendingUp className={`w-4 h-4 ${isGood ? 'text-emerald-400' : 'text-red-400'}`} /> : <TrendingDown className={`w-4 h-4 ${isGood ? 'text-emerald-400' : 'text-red-400'}`} />}
            <span className={`text-sm ${isGood ? 'text-emerald-400' : 'text-red-400'}`}>{Math.abs(data.changePct ?? 0).toFixed(1)}%</span>
          </div>
        )}
      </div>
      <p className={`text-2xl md:text-3xl font-bold ${target != null ? (atTarget ? 'text-emerald-400' : 'text-red-400') : 'text-[#f1f5f9]'}`}>
        {typeof data.value === 'number' ? (unit === '%' ? data.value.toFixed(1) : Math.round(data.value).toLocaleString()) : data.value}{unit}
      </p>
      {data.previousValue !== null && (
        <p className="text-[#64748b] text-sm mt-1">vs {Math.round(data.previousValue).toLocaleString()}{unit} last month</p>
      )}
    </div>
  );
}

function ForecastMetricCard({ title, value, unit = '', isDate = false, trend = 'normal' }: ForecastMetricCardProps) {
  const trendStyles: Record<string, string> = {
    danger: 'border-l-red-500',
    warning: 'border-l-amber-500',
    success: 'border-l-emerald-500',
    normal: 'border-l-[#243049]'
  };

  let displayValue = 'N/A';
  if (isDate && value) {
    // Format date string like "2026-08" to "Aug 2026"
    const dateMatch = String(value).match(/^(\d{4})-(\d{2})$/);
    if (dateMatch) {
      const [, year, month] = dateMatch;
      const d = new Date(parseInt(year), parseInt(month) - 1);
      displayValue = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    } else {
      displayValue = String(value);
    }
  } else if (typeof value === 'string') {
    // String values like "Not projected" or "Low risk"
    displayValue = value;
  } else if (typeof value === 'number' && !isNaN(value)) {
    displayValue = `${value.toFixed(1)}${unit}`;
  }

  return (
    <div className={`bg-[#1a2744] rounded-xl border border-[#2d3a52] border-l-4 ${trendStyles[trend]} p-3 md:p-5`}>
      <p className="text-[#64748b] text-[15px] mb-1">{title}</p>
      <p className="text-xl md:text-2xl font-bold text-[#f1f5f9]">{displayValue}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function GPLDetail({ data, onLoadDate }: GPLDetailProps) {
  // Tab state
  const [activeTab, setActiveTab] = useState<string>('overview');

  // Swipe gesture for mobile tab navigation
  const isMobile = useIsMobile();
  const tabIds = ['overview', 'stations', 'trends', 'forecast'];

  const handleSwipeLeft = useCallback(() => {
    setActiveTab(prev => {
      const idx = tabIds.indexOf(prev);
      return idx < tabIds.length - 1 ? tabIds[idx + 1] : prev;
    });
  }, []);

  const handleSwipeRight = useCallback(() => {
    setActiveTab(prev => {
      const idx = tabIds.indexOf(prev);
      return idx > 0 ? tabIds[idx - 1] : prev;
    });
  }, []);

  const swipeRef = useSwipeGesture<HTMLDivElement>({
    onSwipeLeft: handleSwipeLeft,
    onSwipeRight: handleSwipeRight,
    enabled: isMobile,
  });

  // Station filter state (for Station Health tab)
  const [stationFilter, setStationFilter] = useState<string>('all');

  // DBIS upload toggle
  const [showDbisUpload, setShowDbisUpload] = useState(false);

  // Alert expansion state
  const [expandedAlerts, setExpandedAlerts] = useState<Record<string, boolean>>({});

  // History state
  const [historyDates, setHistoryDates] = useState<{ reportDate: string; fileName: string; createdAt: string }[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [historyLoading, setHistoryLoading] = useState(false);

  // KPI data state
  const [kpiData, setKpiData] = useState<KpiState>({ latest: null, trends: [], analysis: null });
  const [kpiLoading, setKpiLoading] = useState(true);


  // Forecast data state
  const [forecastData, setForecastData] = useState<any>(null);
  const [forecastLoading, setForecastLoading] = useState(true);
  const [refreshingForecast, setRefreshingForecast] = useState(false);

  // Multivariate forecast state (legacy — still used for computedProjections fallback)
  const [multiForecast, setMultiForecast] = useState<any>(null);
  const [multiForecastLoading, setMultiForecastLoading] = useState(true);
  const [selectedScenario, setSelectedScenario] = useState<'conservative' | 'aggressive'>('conservative');
  const [methodologyExpanded, setMethodologyExpanded] = useState(false);
  const [selectedGrid, setSelectedGrid] = useState<'dbis' | 'essequibo'>('dbis');

  // Enhanced forecast state (Claude Opus)
  const [enhancedForecast, setEnhancedForecast] = useState<any>(null);
  const [enhancedLoading, setEnhancedLoading] = useState(true);
  const [enhancedRegenerating, setEnhancedRegenerating] = useState(false);
  const [enhancedCached, setEnhancedCached] = useState(false);

  // Fetch KPI data (with AbortController for cleanup on unmount)
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

  // Fetch forecast data (legacy + multivariate) with AbortController
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

  // Fetch enhanced forecast (Claude Opus) with AbortController
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
          // Set initial selected date from current data
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

  // Handle date change
  const handleDateChange = async (date: string) => {
    if (!date || date === selectedDate || !onLoadDate) return;
    setHistoryLoading(true);
    setSelectedDate(date);
    await onLoadDate(date);
    setHistoryLoading(false);
  };

  // Refresh multivariate forecasts
  const handleRefreshForecast = async () => {
    setRefreshingForecast(true);
    try {
      // Call multivariate refresh (uses Claude Opus)
      const response = await fetch(`${API_BASE}/gpl/forecast/multivariate/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const result = await response.json();

      if (result.success) {
        setMultiForecast(result.forecast);
      }

      // Also refresh legacy forecasts
      const legacyResponse = await fetch(`${API_BASE}/gpl/forecast/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ includeAI: false })
      });
      const legacyResult = await legacyResponse.json();
      if (legacyResult.success) {
        const refreshed = await fetch(`${API_BASE}/gpl/forecast/all`);
        const refreshedData = await refreshed.json();
        if (refreshedData.success) {
          setForecastData(refreshedData.data);
        }
      }
    } catch (err) {
      console.error('Failed to refresh forecasts:', err);
    } finally {
      setRefreshingForecast(false);
    }
  };

  // Regenerate enhanced forecast (force — ignores cache)
  const handleRegenerateEnhanced = async () => {
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
  };

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

  if (!summary) {
    return (
      <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] p-6 md:p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#2d3a52] flex items-center justify-center mx-auto mb-4">
          <Upload className="w-8 h-8 text-[#64748b]" />
        </div>
        <h3 className="text-[#f1f5f9] text-lg font-semibold mb-2">No DBIS Data Available</h3>
        <p className="text-[#64748b] text-base mb-6 max-w-md mx-auto">
          Upload a GPL DBIS Excel report to populate the dashboard with generation data, station status, and AI analysis.
        </p>
        <GPLExcelUpload onCancel={() => {}} />
      </div>
    );
  }

  // Calculate reserve margin for health indicator
  const eveningPeak = data.actualEveningPeak?.onBars || 0;
  const reserveMargin = summary.totalDBIS > 0 ? ((summary.totalDBIS - eveningPeak) / summary.totalDBIS) * 100 : 0;

  // Compute projections with client-side fallback when server forecasts unavailable
  const computedProjections: ComputedProjections = useMemo(() => {
    // Check if server-side DBIS forecasts exist
    const serverDbisForecasts = forecastData?.demand?.filter((d: any) => d.grid === 'DBIS') || [];
    const serverEsqForecasts = forecastData?.demand?.filter((d: any) => d.grid === 'Essequibo') || [];

    // Current values
    const currentDbis = eveningPeak || 0;
    const currentEsq = kpiData.latest?.kpis?.['Peak Demand Essequibo']?.value ||
                       (kpiData.trends?.slice(-1)[0] as any)?.['Peak Demand Essequibo'] || 13;

    // Helper: get projected value from server data or compute linear projection
    const getProjection = (serverForecasts: any[], current: number, monthlyGrowthRate: number, monthIndex: number): number => {
      if (serverForecasts.length > monthIndex && serverForecasts[monthIndex]?.projected_peak_mw) {
        return parseFloat(serverForecasts[monthIndex].projected_peak_mw);
      }
      // Fallback: linear projection
      const months = monthIndex + 1; // monthIndex 5 = 6 months out
      return current + (monthlyGrowthRate * months);
    };

    // Calculate growth rates from KPI trends if available
    let dbisGrowthRate = 2.0; // Default ~2 MW/month for DBIS
    let esqGrowthRate = 0.16; // Default ~0.16 MW/month for Essequibo

    if (kpiData.trends?.length >= 3) {
      // DBIS growth rate from trends
      const dbisValues = kpiData.trends
        .map((t: any) => t['Peak Demand DBIS'])
        .filter((v: any) => v != null && v > 0);
      if (dbisValues.length >= 2) {
        const firstDbis = dbisValues[0];
        const lastDbis = dbisValues[dbisValues.length - 1];
        dbisGrowthRate = (lastDbis - firstDbis) / dbisValues.length;
        if (dbisGrowthRate <= 0) dbisGrowthRate = 2.0; // Ensure positive growth
      }

      // Essequibo growth rate from trends
      const esqValues = kpiData.trends
        .map((t: any) => t['Peak Demand Essequibo'])
        .filter((v: any) => v != null && v > 0);
      if (esqValues.length >= 2) {
        const firstEsq = esqValues[0];
        const lastEsq = esqValues[esqValues.length - 1];
        esqGrowthRate = (lastEsq - firstEsq) / esqValues.length;
        if (esqGrowthRate <= 0) esqGrowthRate = 0.16; // Ensure positive growth
      }
    }

    // Compute projections for each timeframe
    const dbis6mo = getProjection(serverDbisForecasts, currentDbis, dbisGrowthRate, 5);
    const dbis12mo = getProjection(serverDbisForecasts, currentDbis, dbisGrowthRate, 11);
    const dbis24mo = getProjection(serverDbisForecasts, currentDbis, dbisGrowthRate, 23);

    const esq6mo = getProjection(serverEsqForecasts, currentEsq, esqGrowthRate, 5);
    const esq12mo = getProjection(serverEsqForecasts, currentEsq, esqGrowthRate, 11);
    const esq24mo = getProjection(serverEsqForecasts, currentEsq, esqGrowthRate, 23);

    // Determine if using fallback
    const usingFallback = serverDbisForecasts.length === 0;

    return {
      currentDbis,
      currentEsq,
      dbis: {
        '6mo': dbis6mo,
        '12mo': dbis12mo,
        '24mo': dbis24mo,
        growthRate: dbisGrowthRate
      },
      esq: {
        '6mo': esq6mo,
        '12mo': esq12mo,
        '24mo': esq24mo,
        growthRate: esqGrowthRate
      },
      usingFallback,
      // Chart data array
      chartData: [
        { period: 'Current', dbis: currentDbis, esq: currentEsq },
        { period: '6 months', dbis: dbis6mo, esq: esq6mo },
        { period: '12 months', dbis: dbis12mo, esq: esq12mo },
        { period: '24 months', dbis: dbis24mo, esq: esq24mo }
      ],
      // Capacity data from server
      capacity: forecastData?.capacity || [],
      loadShedding: forecastData?.loadShedding || null
    };
  }, [forecastData, eveningPeak, kpiData]);

  const healthStatus = reserveMargin < 10 ? 'critical' : reserveMargin < 15 ? 'warning' : 'good';
  const gplHealth = useMemo(() => computeGPLHealth(data), [data]);

  // Consolidate alerts from AI analysis
  const consolidatedAlerts = useMemo<ConsolidatedAlert[]>(() => {
    const alerts: ConsolidatedAlert[] = [];

    // Add critical alerts (camelCase from API)
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

    // Add station concerns
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

    // Add recommendations as actionable alerts
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

  // Filter stations based on filter state
  const filteredStations = useMemo(() => {
    if (stationFilter === 'all') return summary.stations;
    return summary.stations.filter(s => s.status === stationFilter);
  }, [summary.stations, stationFilter]);

  // Capacity utilization data for donut chart
  const utilizationData = [
    { name: 'Available', value: summary.totalAvailable, fill: '#10b981' },
    { name: 'Degraded', value: summary.degraded.reduce((sum, s) => sum + (s.derated - s.available), 0), fill: '#f59e0b' },
    { name: 'Offline', value: summary.totalOffline, fill: '#ef4444' }
  ].filter(d => d.value > 0);

  // Status colors
  const getStatusColor = (status: string): string => ({
    operational: '#10b981',
    degraded: '#f59e0b',
    critical: '#f97316',
    offline: '#ef4444'
  } as Record<string, string>)[status] || '#64748b';

  const getStatusBg = (status: string): string => ({
    operational: 'bg-emerald-500/[0.15] border-emerald-500/30 text-emerald-400',
    degraded: 'bg-amber-500/[0.15] border-amber-500/30 text-amber-400',
    critical: 'bg-orange-500/[0.15] border-orange-500/30 text-orange-400',
    offline: 'bg-red-500/[0.15] border-red-500/30 text-red-400'
  } as Record<string, string>)[status] || 'bg-[#64748b]/[0.15] border-[#64748b]/30 text-[#94a3b8]';

  // Tab definitions — memoized to prevent unnecessary re-renders
  const tabs = useMemo(() => [
    { id: 'overview', label: 'Overview', fullLabel: 'System Overview' },
    { id: 'stations', label: 'Stations', fullLabel: 'Station Health' },
    { id: 'trends', label: 'KPIs', fullLabel: 'Trends & KPIs' },
    { id: 'forecast', label: 'Forecast', fullLabel: 'Forecast' },
  ], []);

  return (
    <div className="space-y-4">
      {/* PERSISTENT KPI STRIP */}
      <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] p-3 md:p-4">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between mb-3 gap-4">
          <div className="flex items-start gap-4 w-full md:flex-1 md:min-w-0">
            {/* Health Score Gauge with Tooltip */}
            {gplHealth && (
              <div className="flex flex-col items-center flex-shrink-0">
                <HealthScoreTooltip
                  score={gplHealth.score}
                  severity={gplHealth.severity}
                  breakdown={gplHealth.breakdown}
                  size={88}
                />
                <span className={`text-[10px] font-medium mt-1 ${
                  gplHealth.severity === 'critical' ? 'text-red-400'
                    : gplHealth.severity === 'warning' ? 'text-amber-400'
                    : gplHealth.severity === 'positive' ? 'text-emerald-400'
                    : 'text-blue-400'
                }`}>
                  {gplHealth.label}
                </span>
              </div>
            )}
            {/* AI Headline */}
            <div className="min-w-0 flex-1 pt-1">
              {data.aiAnalysis?.executiveBriefing ? (
                <>
                  <p className="text-[#d4af37] text-sm font-semibold mb-1">AI Executive Briefing</p>
                  <p className="text-[#94a3b8] text-[13px] leading-relaxed line-clamp-3">
                    {typeof data.aiAnalysis.executiveBriefing === 'string'
                      ? data.aiAnalysis.executiveBriefing
                      : data.aiAnalysis.executiveBriefing.executive_summary || data.aiAnalysis.executiveBriefing.headline || 'Analysis available'}
                  </p>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${
                    healthStatus === 'critical' ? 'bg-red-500 animate-pulse' :
                    healthStatus === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'
                  }`} />
                  <span className="text-[#94a3b8] text-[15px] font-medium">System Health</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {historyDates.length > 1 && (
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#64748b]" />
                <select
                  value={selectedDate}
                  onChange={(e) => handleDateChange(e.target.value)}
                  disabled={historyLoading}
                  className="bg-[#0a1628] text-[#94a3b8] text-sm border border-[#2d3a52] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#d4af37] disabled:opacity-50"
                >
                  {historyDates.map(h => (
                    <option key={h.reportDate} value={h.reportDate}>
                      {new Date(h.reportDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </option>
                  ))}
                </select>
                {historyLoading && (
                  <RefreshCw className="w-4 h-4 text-[#d4af37] animate-spin" />
                )}
              </div>
            )}
            {historyDates.length <= 1 && (
              <span className="text-sm text-[#64748b]">Updated: {data.capacityDate || '-'}</span>
            )}
          </div>
        </div>

        {/* Health Breakdown — full-width below the header row */}
        {gplHealth && (
          <HealthBreakdownSection
            breakdown={gplHealth.breakdown}
            score={gplHealth.score}
            label={gplHealth.label}
            severity={gplHealth.severity}
          />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Available Capacity */}
          <div className="flex items-center gap-3 p-2.5 md:p-4 bg-[#0a1628] rounded-lg border-l-4 border-emerald-500">
            <div>
              <p className="text-[#64748b] text-[15px]">Available Capacity</p>
              <p className="text-xl md:text-2xl font-bold text-[#f1f5f9]">{summary.totalAvailable}<span className="text-sm md:text-base font-normal text-[#64748b]"> / {summary.totalDerated} MW</span></p>
            </div>
          </div>

          {/* Reserve Margin */}
          <div className={`flex items-center gap-3 p-2.5 md:p-4 bg-[#0a1628] rounded-lg border-l-4 ${
            reserveMargin < 10 ? 'border-red-500' : reserveMargin < 15 ? 'border-amber-500' : 'border-emerald-500'
          }`}>
            <div>
              <p className="text-[#64748b] text-[15px]">Reserve Margin</p>
              <p className={`text-xl md:text-2xl font-bold ${
                reserveMargin < 10 ? 'text-red-400' : reserveMargin < 15 ? 'text-amber-400' : 'text-emerald-400'
              }`}>{reserveMargin.toFixed(1)}%</p>
              <p className="text-[#64748b] text-xs">{reserveMargin < 15 ? 'Below 15% safe threshold' : 'Adequate'}</p>
            </div>
          </div>

          {/* Offline Capacity */}
          <div className={`flex items-center gap-3 p-2.5 md:p-4 bg-[#0a1628] rounded-lg border-l-4 ${
            summary.offline.length > 0 ? 'border-red-500' : 'border-[#2d3a52]'
          }`}>
            <div>
              <p className="text-[#64748b] text-[15px]">Offline Capacity</p>
              <p className="text-xl md:text-2xl font-bold text-red-400">{summary.totalOffline} MW</p>
              <p className="text-[#64748b] text-xs">{summary.offline.length} stations offline</p>
            </div>
          </div>

          {/* Peak Demand */}
          <div className="flex items-center gap-3 p-2.5 md:p-4 bg-[#0a1628] rounded-lg border-l-4 border-purple-500">
            <div>
              <p className="text-[#64748b] text-[15px]">Peak Demand (Evening)</p>
              <p className="text-xl md:text-2xl font-bold text-purple-400">{eveningPeak || '-'} MW</p>
              <p className="text-[#64748b] text-xs">{data.peakDemandDate || '-'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* TAB BAR */}
      <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] p-1.5">
        <div className="flex gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-2 md:px-4 py-2 md:py-2.5 rounded-lg text-xs md:text-base font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-[#d4af37] text-[#0a1628] shadow-lg shadow-[#d4af37]/20'
                  : 'text-[#94a3b8] hover:text-[#f1f5f9] hover:bg-[#2d3a52]'
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

        {/* ===================== TAB 1: SYSTEM OVERVIEW ===================== */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {/* Active Alerts - Compact List */}
            <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#2d3a52] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="text-amber-400" size={16} />
                  <h3 className="text-[#f1f5f9] font-medium text-lg">Active Alerts</h3>
                  {criticalCount > 0 && (
                    <span className="bg-red-500/20 text-red-400 text-xs px-1.5 py-0.5 rounded-full font-medium">
                      {criticalCount}
                    </span>
                  )}
                </div>
                <span className="text-[#64748b] text-xs">{consolidatedAlerts.length} total</span>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {consolidatedAlerts.length === 0 ? (
                  <div className="p-3 text-center text-[#64748b] text-sm">No active alerts</div>
                ) : (
                  consolidatedAlerts.slice(0, 6).map(alert => (
                    <div
                      key={alert.id}
                      className="px-3 py-2 border-b border-[#2d3a52]/30 hover:bg-[#2d3a52]/30 flex items-center gap-2"
                    >
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        alert.severity === 'critical' ? 'bg-red-500' :
                        alert.severity === 'high' ? 'bg-orange-500' :
                        alert.severity === 'medium' ? 'bg-blue-500' : 'bg-[#64748b]'
                      }`} />
                      <span className="text-[#e2e8f0] text-sm flex-1 truncate">{alert.title}</span>
                      {alert.station && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-[#2d3a52] text-[#94a3b8] flex-shrink-0">{alert.station}</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Upload DBIS Report */}
            {!showDbisUpload ? (
              <button
                onClick={() => setShowDbisUpload(true)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-[#2d3a52] hover:border-[#d4af37]/50 bg-[#1a2744]/50 hover:bg-[#1a2744] text-[#94a3b8] hover:text-[#d4af37] transition-all"
              >
                <Upload size={16} />
                <span className="text-sm font-medium">Upload DBIS Excel Report</span>
              </button>
            ) : (
              <GPLExcelUpload
                onCancel={() => setShowDbisUpload(false)}
              />
            )}

            {/* Fleet at a Glance */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Station Grid */}
              <div className="lg:col-span-2 space-y-3">
                {/* Summary line — always visible */}
                <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] p-3 md:p-4">
                  <h3 className="text-[#f1f5f9] font-medium text-lg mb-2">Fleet at a Glance</h3>
                  <p className="text-[#94a3b8] text-[15px]">
                    {summary.operational.length} operational, {summary.degraded.length} degraded, {summary.offline.length} offline
                  </p>
                </div>
                {/* Collapsible station detail */}
                <CollapsibleSection
                  title="Station Detail"
                  icon={Factory}
                  badge={{ text: `${summary.stations.length} stations`, variant: 'gold' }}
                  defaultOpen={false}
                >
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                    {summary.stations.map(station => (
                      <div
                        key={station.name}
                        className="bg-[#0a1628] rounded-lg p-3 border border-[#2d3a52] hover:border-[#d4af37]/50 transition-colors group relative"
                        title={`${station.name}: ${station.available}/${station.derated} MW (${station.units} units)`}
                      >
                        <p className="text-[#f1f5f9] text-[11px] font-medium leading-tight break-words">{station.name}</p>
                        <p className="text-[#94a3b8] text-xs">{station.available}/{station.derated}</p>
                        <div className="h-2 bg-[#2d3a52] rounded-full mt-1.5 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${station.availability}%`,
                              backgroundColor: getStatusColor(station.status)
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Legend */}
                  <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t border-[#2d3a52]">
                    <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-emerald-500" /><span className="text-[#94a3b8] text-sm">Operational</span></div>
                    <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-amber-500" /><span className="text-[#94a3b8] text-sm">Degraded</span></div>
                    <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-orange-500" /><span className="text-[#94a3b8] text-sm">Critical</span></div>
                    <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-red-500" /><span className="text-[#94a3b8] text-sm">Offline</span></div>
                  </div>
                </CollapsibleSection>
              </div>

              {/* Utilization Donut */}
              <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] p-3 md:p-4">
                <h3 className="text-[#f1f5f9] font-medium text-lg mb-2">Capacity Utilization</h3>
                <div className="h-48 relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={utilizationData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {utilizationData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', fontSize: '14px' }}
                        labelStyle={{ color: '#f1f5f9' }}
                        formatter={(value: number) => `${value.toFixed(1)} MW`}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-2xl md:text-3xl font-bold text-[#f1f5f9]">{summary.availability}%</p>
                      <p className="text-[#64748b] text-sm">Fleet</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5 mt-2">
                  {utilizationData.map(item => (
                    <div key={item.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: item.fill }} />
                        <span className="text-[#94a3b8]">{item.name}</span>
                      </div>
                      <span className="text-[#f1f5f9] font-medium">{item.value.toFixed(1)} MW</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* AI Executive Briefing — Data-Driven Insight Cards */}
            {(() => {
              // Resolve AI briefing data (may or may not exist)
              const rawBriefing = data.aiAnalysis?.executiveBriefing || data.aiAnalysis?.executive_briefing;
              const aiSections: Record<string, { summary?: string; detail?: string; severity?: string }> = {};

              // Map AI sections by normalized title for lookup
              if (rawBriefing && typeof rawBriefing === 'object' && rawBriefing.sections) {
                for (const s of rawBriefing.sections) {
                  const key = (s.title || '').toLowerCase();
                  if (key.includes('system') || key.includes('status')) aiSections['system'] = s;
                  else if (key.includes('critical') || key.includes('issue')) aiSections['issues'] = s;
                  else if (key.includes('positive') || key.includes('strong') || key.includes('performer')) aiSections['performers'] = s;
                  else if (key.includes('action') || key.includes('required')) aiSections['actions'] = s;
                }
              }

              // Build headline — full text, never truncated
              let headline: string | null = null;
              if (rawBriefing) {
                if (typeof rawBriefing === 'object' && rawBriefing.headline) {
                  headline = rawBriefing.headline;
                } else if (typeof rawBriefing === 'string') {
                  headline = rawBriefing.split('\n').filter((l: string) => l.trim()).slice(0, 3).join(' ');
                }
              }

              // Data-driven summaries for each card
              const critStations = [...summary.critical, ...summary.offline];
              const lostMw = critStations.reduce((sum, s) => sum + (s.derated - s.available), 0);
              const topPerformers = summary.operational
                .filter(s => s.availability >= 95)
                .sort((a, b) => b.available - a.available);
              const topBaseload = topPerformers.reduce((sum, s) => sum + s.available, 0);

              const critAlerts = data.aiAnalysis?.criticalAlerts || data.aiAnalysis?.critical_alerts || [];
              const recommendations = data.aiAnalysis?.recommendations || [];
              const urgentRecs = recommendations.filter((r: any) => r.urgency === 'Immediate' || r.urgency === 'Short-term');
              const actionCount = urgentRecs.length + critAlerts.length;

              // Build 4 insight cards
              const insightCards: InsightCardData[] = [
                {
                  emoji: '\u26A1',
                  title: 'System Status',
                  severity: summary.availability >= 75 ? 'stable' : summary.availability >= 60 ? 'warning' : 'critical',
                  summary: `${summary.totalAvailable} MW available of ${summary.totalDerated} MW installed (${summary.availability}%)`,
                  detail: aiSections['system']?.detail || null,
                },
                {
                  emoji: '\uD83D\uDEA8',
                  title: 'Critical Issues',
                  severity: critStations.length > 2 ? 'critical' : critStations.length > 0 ? 'warning' : 'positive',
                  summary: critStations.length > 0
                    ? `${summary.critical.length} station${summary.critical.length !== 1 ? 's' : ''} below 50%, ${summary.offline.length} offline, ${lostMw.toFixed(1)} MW lost`
                    : 'No critical issues detected',
                  detail: aiSections['issues']?.detail || null,
                },
                {
                  emoji: '\u2705',
                  title: 'Strong Performers',
                  severity: 'positive',
                  summary: topPerformers.length > 0
                    ? `${topPerformers.slice(0, 4).map(s => s.name).join(', ')} at 95%+ capacity \u2014 ${topBaseload.toFixed(1)} MW stable baseload`
                    : `${summary.operational.length} station${summary.operational.length !== 1 ? 's' : ''} operational`,
                  detail: aiSections['performers']?.detail || null,
                },
                {
                  emoji: '\uD83D\uDCCB',
                  title: 'Action Required',
                  severity: actionCount > 3 ? 'warning' : actionCount > 0 ? 'stable' : 'positive',
                  summary: actionCount > 0
                    ? `${actionCount} priority action${actionCount !== 1 ? 's' : ''} for DG attention`
                    : 'No urgent actions required',
                  detail: aiSections['actions']?.detail
                    || (urgentRecs.length > 0
                      ? urgentRecs.map((r: any) => `\u2022 ${r.recommendation}`).join('\n')
                      : null),
                },
              ];

              return (
                <div className="space-y-3">
                  {/* HEADLINE — full text, never truncated */}
                  {headline && (
                    <div className="bg-gradient-to-r from-[#1a2744] to-[#2d3a52]/80 rounded-xl border border-[#d4af37]/20 p-3 md:p-5">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shrink-0 mt-0.5">
                          <Activity className="w-5 h-5 text-white" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-widest text-[#d4af37] font-semibold mb-1.5">AI Executive Briefing</p>
                          <p className="text-base md:text-[20px] font-bold text-[#f1f5f9] leading-snug">{headline}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 4 INSIGHT CARDS — 2x2 grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {insightCards.map((card, i) => (
                      <InsightCard key={i} card={card} />
                    ))}
                  </div>

                  {/* CRITICAL ALERTS — each as a mini-card with severity left border */}
                  {critAlerts.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 px-1">
                        <AlertTriangle className="w-4 h-4 text-red-400" />
                        <span className="text-[15px] font-semibold text-[#f1f5f9]">Critical Alerts</span>
                        <span className="bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded-full font-medium">{critAlerts.length}</span>
                      </div>
                      {critAlerts.map((alert: any, i: number) => {
                        const alertSev = (alert.severity || 'CRITICAL').toUpperCase();
                        const borderColor = alertSev === 'CRITICAL' ? 'border-l-red-500' : alertSev === 'HIGH' ? 'border-l-orange-500' : 'border-l-amber-500';
                        return (
                          <div key={i} className={`bg-[#1a2744] rounded-lg border border-[#2d3a52] border-l-4 ${borderColor} p-4`}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[15px] font-semibold text-[#f1f5f9]">{alert.title}</span>
                              <span className="text-[10px] uppercase px-1.5 py-0.5 bg-red-500/15 text-red-400 rounded font-medium">
                                {alertSev}
                              </span>
                            </div>
                            <p className="text-[#94a3b8] text-sm leading-relaxed">{alert.description}</p>
                            {alert.recommendation && (
                              <p className="text-blue-400 text-sm mt-1.5">\u2192 {alert.recommendation}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ===================== TAB 2: STATION HEALTH ===================== */}
        {activeTab === 'stations' && (
          <div className="space-y-4">
            {/* Filter Chips */}
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'all', label: 'All', count: summary.stations.length },
                { id: 'operational', label: 'Operational', count: summary.operational.length },
                { id: 'degraded', label: 'Degraded', count: summary.degraded.length },
                { id: 'critical', label: 'Critical', count: summary.critical.length },
                { id: 'offline', label: 'Offline', count: summary.offline.length }
              ].map(filter => (
                <button
                  key={filter.id}
                  onClick={() => setStationFilter(filter.id)}
                  className={`px-4 py-2 rounded-lg text-base font-medium transition-colors flex items-center gap-2 ${
                    stationFilter === filter.id
                      ? 'bg-[#d4af37] text-[#0a1628]'
                      : 'bg-[#1a2744] text-[#94a3b8] hover:text-[#f1f5f9] border border-[#2d3a52]'
                  }`}
                >
                  {filter.label}
                  <span className={`text-sm px-2 py-0.5 rounded-full ${
                    stationFilter === filter.id ? 'bg-[#0a1628]/20' : 'bg-[#2d3a52]'
                  }`}>{filter.count}</span>
                </button>
              ))}
            </div>

            {/* Station Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredStations.map(station => {
                const StatusIcon = station.name.includes('PS') ? Ship : Factory;

                return (
                  <div
                    key={station.name}
                    className={`bg-[#1a2744] rounded-xl border ${
                      station.status === 'critical' || station.status === 'offline'
                        ? 'border-red-500/40'
                        : station.status === 'degraded'
                          ? 'border-amber-500/30'
                          : 'border-[#2d3a52]'
                    } p-3 md:p-5`}
                  >
                    {/* Header: station name + status badge */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-[#2d3a52] flex items-center justify-center">
                          <StatusIcon className="w-4.5 h-4.5 text-[#94a3b8]" />
                        </div>
                        <span className="text-[#f1f5f9] font-semibold text-[15px]">{station.name}</span>
                      </div>
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium border ${getStatusBg(station.status)}`}>
                        {station.status.charAt(0).toUpperCase() + station.status.slice(1)}
                      </span>
                    </div>

                    {/* MW values — always visible */}
                    <div className="flex items-baseline gap-1 mb-3">
                      <span className="text-2xl md:text-3xl font-bold text-[#f1f5f9]">{station.available}</span>
                      <span className="text-[#64748b] text-base">/ {station.derated} MW</span>
                    </div>

                    {/* Progress bar — always visible */}
                    <div className="h-2.5 bg-[#2d3a52] rounded-full overflow-hidden mb-3">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${station.availability}%`,
                          backgroundColor: getStatusColor(station.status)
                        }}
                      />
                    </div>

                    {/* Units + % — always visible */}
                    <div className="flex items-center justify-between text-[15px] text-[#64748b]">
                      <span>{station.units} units</span>
                      <span>{(station.availability ?? 0).toFixed(0)}% available</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ===================== TAB 3: TRENDS & KPIs ===================== */}
        {activeTab === 'trends' && (
          <div className="space-y-4">
            {/* Full GPLMonthlyKpi component (includes upload, cards, charts, AI analysis) */}
            <GPLMonthlyKpi />

            {kpiLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-6 h-6 text-[#64748b] animate-spin" />
              </div>
            ) : (
              <>
                {/* KPI Summary Cards - Reduced to 3 */}
                {kpiData.latest?.kpis && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <KpiSummaryCard
                      name="Peak Demand DBIS"
                      data={kpiData.latest.kpis['Peak Demand DBIS']}
                      icon={Zap}
                      unit="MW"
                    />
                    <KpiSummaryCard
                      name="Affected Customers"
                      data={kpiData.latest.kpis['Affected Customers']}
                      icon={Users}
                      unit=""
                      inverseGood
                    />
                    <KpiSummaryCard
                      name="Collection Rate"
                      data={kpiData.latest.kpis['Collection Rate %']}
                      icon={DollarSign}
                      unit="%"
                      target={95}
                    />
                  </div>
                )}

                {/* Charts — collapsible */}
                {kpiData.trends.length > 0 && (
                  <CollapsibleSection
                    title="Historical Charts"
                    icon={Activity}
                    badge={{ text: '2 charts', variant: 'info' }}
                    defaultOpen={false}
                  >
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Peak Demand Trends */}
                    <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] p-3 md:p-4">
                      <h4 className="text-[#f1f5f9] font-medium text-lg mb-4">Peak Demand Trends</h4>
                      <div className="h-48 md:h-72 overflow-x-auto">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={kpiData.trends}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2d3a52" />
                            <XAxis
                              dataKey="month"
                              stroke="#94a3b8"
                              tick={{ fontSize: 12 }}
                              tickFormatter={(v: string) => v?.slice(5, 7)}
                            />
                            <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', fontSize: '14px' }}
                              labelStyle={{ color: '#f1f5f9' }}
                            />
                            <Legend wrapperStyle={{ fontSize: '14px' }} />
                            <Area
                              type="monotone"
                              dataKey="Peak Demand DBIS"
                              stroke="#f59e0b"
                              fill="#f59e0b"
                              fillOpacity={0.2}
                              name="DBIS"
                            />
                            <Area
                              type="monotone"
                              dataKey="Peak Demand Essequibo"
                              stroke="#10b981"
                              fill="#10b981"
                              fillOpacity={0.2}
                              name="Essequibo"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Collection Rate - Bar Chart (Fixed legibility) */}
                    <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] p-3 md:p-4">
                      <h4 className="text-[#f1f5f9] font-medium text-lg mb-4">Collection Rate Performance</h4>
                      <div className="h-48 md:h-80 overflow-x-auto">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={kpiData.trends} margin={{ top: 25, right: 20, left: 10, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2d3a52" />
                            <XAxis
                              dataKey="month"
                              stroke="#94a3b8"
                              tick={{ fontSize: 13, fill: '#94a3b8' }}
                              tickFormatter={(v: string) => {
                                if (!v) return '';
                                const d = new Date(v);
                                return `${d.toLocaleString('en', { month: 'short' })} ${String(d.getFullYear()).slice(2)}`;
                              }}
                              angle={-45}
                              textAnchor="end"
                              height={50}
                              interval={0}
                            />
                            <YAxis
                              stroke="#94a3b8"
                              tick={{ fontSize: 13, fill: '#94a3b8' }}
                              domain={[70, 105]}
                              tickFormatter={(v: number) => `${v}%`}
                            />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', fontSize: '14px' }}
                              labelStyle={{ color: '#f1f5f9' }}
                              formatter={(v: any) => v ? `${v.toFixed(1)}%` : 'N/A'}
                              labelFormatter={(v: string) => {
                                if (!v) return '';
                                const d = new Date(v);
                                return d.toLocaleString('en', { month: 'long', year: 'numeric' });
                              }}
                            />
                            <ReferenceLine
                              y={95}
                              stroke="#ef4444"
                              strokeWidth={2}
                              strokeDasharray="8 4"
                              label={{ value: '95% Target', fill: '#ef4444', fontSize: 13, position: 'right' }}
                            />
                            <Bar dataKey="Collection Rate %" name="Collection Rate" radius={[4, 4, 0, 0]}>
                              {kpiData.trends.map((entry: any, index: number) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={
                                    entry['Collection Rate %'] >= 95 ? '#10b981' :
                                    entry['Collection Rate %'] >= 90 ? '#f59e0b' : '#ef4444'
                                  }
                                />
                              ))}
                              <LabelList
                                dataKey="Collection Rate %"
                                position="top"
                                fill="#f1f5f9"
                                fontSize={11}
                                formatter={(v: any) => v ? `${v.toFixed(0)}%` : ''}
                              />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                  </CollapsibleSection>
                )}
              </>
            )}
          </div>
        )}

        {/* ===================== TAB 4: FORECAST ===================== */}
        {activeTab === 'forecast' && (
          <div className="space-y-4">
            {/* Header with cache info + Regenerate */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-[#f1f5f9] font-medium text-xl md:text-[22px]">Predictive Analytics</h3>
                {enhancedForecast?.metadata?.generated_at && (
                  <p className="text-[#64748b] text-sm mt-0.5">
                    Last generated: {new Date(enhancedForecast.metadata.generated_at).toLocaleString()}
                    {enhancedCached && <span className="text-blue-400 ml-2">(cached)</span>}
                  </p>
                )}
              </div>
              <button
                onClick={handleRegenerateEnhanced}
                disabled={enhancedRegenerating}
                className="px-4 py-2 bg-[#1a2744] hover:bg-[#2d3a52] text-[#94a3b8] rounded-lg flex items-center gap-2 text-base border border-[#2d3a52] disabled:opacity-50"
              >
                <RefreshCw size={16} className={enhancedRegenerating ? 'animate-spin' : ''} />
                {enhancedRegenerating ? 'Generating with Opus...' : 'Regenerate Forecast'}
              </button>
            </div>

            {enhancedLoading || enhancedRegenerating ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <RefreshCw className="w-8 h-8 text-[#d4af37] animate-spin" />
                <p className="text-[#94a3b8] text-[15px]">
                  {enhancedRegenerating ? 'Generating enhanced forecast with Claude Opus...' : 'Loading enhanced forecast...'}
                </p>
                {enhancedRegenerating && (
                  <p className="text-[#64748b] text-sm">This typically takes 15-30 seconds</p>
                )}
              </div>
            ) : enhancedForecast ? (
              <>
                {/* AI Briefing Headline */}
                {enhancedForecast.briefing?.headline && (
                  <div className="bg-gradient-to-r from-[#1a2744] to-[#243049] rounded-xl border border-[#d4af37]/30 p-3 md:p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-[#d4af37]/20 flex items-center justify-center flex-shrink-0">
                        <Zap className="w-5 h-5 text-[#d4af37]" />
                      </div>
                      <p className="text-[#f1f5f9] text-[15px] leading-relaxed font-medium">{enhancedForecast.briefing.headline}</p>
                    </div>
                  </div>
                )}

                {/* Forecast KPI Cards — from most_likely scenario */}
                {(() => {
                  const ml = enhancedForecast.scenarios?.most_likely;
                  const projections = ml?.monthly_projections || [];
                  const proj6 = projections[5];
                  const proj12 = projections[11];

                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <ForecastMetricCard
                        title="Most Likely Peak (6mo)"
                        value={proj6?.peak_mw || 0}
                        unit=" MW"
                        trend={(proj6?.reserve_pct ?? 20) < 15 ? 'warning' : 'normal'}
                      />
                      <ForecastMetricCard
                        title="Reserve Margin (6mo)"
                        value={proj6?.reserve_pct || 0}
                        unit="%"
                        trend={(proj6?.reserve_pct ?? 20) < 10 ? 'danger' : (proj6?.reserve_pct ?? 20) < 15 ? 'warning' : 'success'}
                      />
                      <ForecastMetricCard
                        title="Most Likely Peak (12mo)"
                        value={proj12?.peak_mw || 0}
                        unit=" MW"
                        trend={(proj12?.reserve_pct ?? 20) < 15 ? 'warning' : 'normal'}
                      />
                      <ForecastMetricCard
                        title="Growth Rate"
                        value={ml?.growth_rate || 0}
                        unit="%/yr"
                        trend={(ml?.growth_rate ?? 0) > 5 ? 'warning' : 'normal'}
                      />
                    </div>
                  );
                })()}

                {/* 3-Scenario Trajectory Chart */}
                <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] p-3 md:p-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-2">
                    <h4 className="text-[#f1f5f9] font-medium text-lg">Demand Forecast — 3 Scenarios (24 months)</h4>
                    <div className="flex items-center gap-4 text-xs text-[#64748b]">
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block w-5 h-0.5 bg-[#d4af37]" /> Most Likely
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block w-5 border-t-2 border-dashed border-[#60a5fa]" /> Conservative
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block w-5 border-t-2 border-dashed border-[#f87171]" /> Aggressive
                      </span>
                    </div>
                  </div>
                  <div className="h-48 md:h-80 overflow-x-auto">
                    <ResponsiveContainer width="100%" height="100%">
                      {(() => {
                        const cons = enhancedForecast.scenarios?.conservative?.monthly_projections || [];
                        const ml = enhancedForecast.scenarios?.most_likely?.monthly_projections || [];
                        const agg = enhancedForecast.scenarios?.aggressive?.monthly_projections || [];

                        const chartData = ml.map((m: any, i: number) => {
                          const d = new Date(m.month + '-01');
                          return {
                            label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
                            most_likely: m.peak_mw,
                            conservative: cons[i]?.peak_mw ?? m.peak_mw * 0.95,
                            aggressive: agg[i]?.peak_mw ?? m.peak_mw * 1.05,
                            capacity: m.capacity_mw,
                          };
                        });

                        return (
                          <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2d3a52" />
                            <XAxis dataKey="label" stroke="#94a3b8" tick={{ fontSize: 11 }} interval={2} />
                            <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} domain={['auto', 'auto']} />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', fontSize: '13px' }}
                              labelStyle={{ color: '#f1f5f9' }}
                              formatter={(v: any, name: string) => {
                                const labels: Record<string, string> = { most_likely: 'Most Likely', conservative: 'Conservative', aggressive: 'Aggressive', capacity: 'Capacity' };
                                return [`${Number(v).toFixed(1)} MW`, labels[name] || name];
                              }}
                            />
                            {/* Capacity reference line */}
                            <Line type="monotone" dataKey="capacity" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="8 4" dot={false} name="capacity" />
                            {/* Planning envelope — shaded up to aggressive */}
                            <Area type="monotone" dataKey="aggressive" fill="#f59e0b" fillOpacity={0.06} stroke="none" />
                            {/* Scenario lines */}
                            <Line type="monotone" dataKey="conservative" stroke="#60a5fa" strokeWidth={2} strokeDasharray="6 4" dot={false} name="conservative" />
                            <Line type="monotone" dataKey="most_likely" stroke="#d4af37" strokeWidth={3} dot={false} activeDot={{ r: 5, fill: '#d4af37' }} name="most_likely" />
                            <Line type="monotone" dataKey="aggressive" stroke="#f87171" strokeWidth={2} strokeDasharray="6 4" dot={false} name="aggressive" />
                          </ComposedChart>
                        );
                      })()}
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Scenario Comparison Table */}
                <CollapsibleSection
                  title="Scenario Comparison"
                  icon={Activity}
                  defaultOpen={false}
                  badge={{ text: '24 months' }}
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#2d3a52] bg-[#0a1628]">
                          <th className="text-left py-3 px-4 text-[#94a3b8] font-medium">Timeframe</th>
                          <th className="text-right py-3 px-4 text-blue-400 font-medium">Conservative</th>
                          <th className="text-right py-3 px-4 text-[#d4af37] font-medium">Most Likely</th>
                          <th className="text-right py-3 px-4 text-red-400 font-medium">Aggressive</th>
                          <th className="text-right py-3 px-4 text-[#94a3b8] font-medium">Capacity</th>
                          <th className="text-right py-3 px-4 text-[#94a3b8] font-medium">Reserve (ML)</th>
                          <th className="text-center py-3 px-4 text-[#94a3b8] font-medium">Seasonal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const cons = enhancedForecast.scenarios?.conservative?.monthly_projections || [];
                          const ml = enhancedForecast.scenarios?.most_likely?.monthly_projections || [];
                          const agg = enhancedForecast.scenarios?.aggressive?.monthly_projections || [];
                          const sf = enhancedForecast.seasonal_factors || {};
                          const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

                          const timeframes = [
                            { label: '3 months', idx: 2 },
                            { label: '6 months', idx: 5 },
                            { label: '9 months', idx: 8 },
                            { label: '12 months', idx: 11 },
                            { label: '18 months', idx: 17 },
                            { label: '24 months', idx: 23 },
                          ];

                          const getReserveClass = (pct: number) =>
                            pct >= 20 ? 'text-emerald-400 bg-emerald-500/10' : pct >= 15 ? 'text-amber-400 bg-amber-500/10' : 'text-red-400 bg-red-500/10';

                          const isHighSeason = (monthStr: string) => {
                            if (!monthStr) return false;
                            const monthNum = parseInt(monthStr.split('-')[1]) - 1;
                            const name = monthNames[monthNum];
                            return (sf[name] ?? 1) > 1.03;
                          };

                          return timeframes.map(tf => {
                            const cRow = cons[tf.idx];
                            const mRow = ml[tf.idx];
                            const aRow = agg[tf.idx];
                            if (!mRow) return null;

                            return (
                              <tr key={tf.label} className="border-b border-[#2d3a52]/50">
                                <td className="py-3 px-4 text-[#f1f5f9] font-medium">{tf.label}</td>
                                <td className="py-3 px-4 text-right text-blue-300">{cRow?.peak_mw?.toFixed(1) || '-'} MW</td>
                                <td className="py-3 px-4 text-right text-[#d4af37] font-semibold">{mRow.peak_mw.toFixed(1)} MW</td>
                                <td className="py-3 px-4 text-right text-red-300">{aRow?.peak_mw?.toFixed(1) || '-'} MW</td>
                                <td className="py-3 px-4 text-right text-[#64748b]">{mRow.capacity_mw?.toFixed(0) || '-'} MW</td>
                                <td className={`py-3 px-4 text-right font-medium rounded ${getReserveClass(mRow.reserve_pct)}`}>
                                  {mRow.reserve_pct?.toFixed(1)}%
                                </td>
                                <td className="py-3 px-4 text-center">
                                  {isHighSeason(mRow.month) ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/15 text-amber-400 rounded text-xs font-medium">
                                      <Thermometer className="w-3 h-3" /> Peak
                                    </span>
                                  ) : (
                                    <span className="text-[#64748b] text-xs">&mdash;</span>
                                  )}
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                </CollapsibleSection>

                {/* Methodology & Analysis */}
                <CollapsibleSection
                  title="Methodology & Analysis"
                  icon={Info}
                  defaultOpen={false}
                >
                  <div className="space-y-4">
                    {/* Model Info */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="bg-[#0a1628] rounded-lg p-3 border border-[#2d3a52]">
                        <p className="text-[#64748b] text-xs mb-1">Model Type</p>
                        <p className="text-[#f1f5f9] text-sm font-medium">{enhancedForecast.methodology?.model_type || 'N/A'}</p>
                      </div>
                      <div className="bg-[#0a1628] rounded-lg p-3 border border-[#2d3a52]">
                        <p className="text-[#64748b] text-xs mb-1">R&sup2; Fit</p>
                        <p className="text-[#f1f5f9] text-sm font-medium">{enhancedForecast.methodology?.r_squared?.toFixed(3) || 'N/A'}</p>
                      </div>
                      <div className="bg-[#0a1628] rounded-lg p-3 border border-[#2d3a52]">
                        <p className="text-[#64748b] text-xs mb-1">Confidence</p>
                        <p className="text-[#f1f5f9] text-sm font-medium">{enhancedForecast.methodology?.confidence_level || 'N/A'}</p>
                      </div>
                      <div className="bg-[#0a1628] rounded-lg p-3 border border-[#2d3a52]">
                        <p className="text-[#64748b] text-xs mb-1">Data Points</p>
                        <p className="text-[#f1f5f9] text-sm font-medium">{enhancedForecast.methodology?.data_points || 0} months</p>
                      </div>
                    </div>

                    {/* Factor Weights */}
                    {enhancedForecast.methodology?.factors_used?.length > 0 && (
                      <div className="bg-[#0a1628] rounded-lg p-4 border border-[#2d3a52]">
                        <p className="text-blue-400 text-sm font-medium mb-3">Factor Weights</p>
                        <div className="flex flex-wrap gap-2">
                          {enhancedForecast.methodology.factors_used.map((f: string, i: number) => (
                            <span key={i} className="px-3 py-1.5 bg-[#1a2744] rounded-lg text-[#c8d0dc] text-sm border border-[#2d3a52]">{f}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Seasonal Factors Chart */}
                    {Object.keys(enhancedForecast.seasonal_factors || {}).length > 0 && (
                      <div className="bg-[#0a1628] rounded-lg p-4 border border-[#2d3a52]">
                        <p className="text-blue-400 text-sm font-medium mb-3">Seasonal Demand Factors</p>
                        <div className="h-48 overflow-x-auto">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={Object.entries(enhancedForecast.seasonal_factors).map(([month, factor]) => ({
                                month: month.charAt(0).toUpperCase() + month.slice(1, 3),
                                factor: factor as number,
                              }))}
                              margin={{ top: 10, right: 10, left: 10, bottom: 5 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#2d3a52" />
                              <XAxis dataKey="month" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                              <YAxis domain={[0.85, 1.15]} stroke="#94a3b8" tick={{ fontSize: 11 }} />
                              <Tooltip
                                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', fontSize: '13px' }}
                                formatter={(v: any) => [`${((Number(v) - 1) * 100).toFixed(1)}% vs avg`, 'Seasonal Factor']}
                              />
                              <ReferenceLine y={1.0} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: 'Average', fill: '#64748b', fontSize: 11, position: 'right' }} />
                              <Bar dataKey="factor" radius={[4, 4, 0, 0]}>
                                {Object.entries(enhancedForecast.seasonal_factors).map(([, factor], i) => (
                                  <Cell key={i} fill={(factor as number) > 1.03 ? '#f59e0b' : (factor as number) < 0.97 ? '#60a5fa' : '#475569'} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="flex items-center justify-center gap-4 mt-2 text-xs text-[#64748b]">
                          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#f59e0b] inline-block" /> Above average (peak)</span>
                          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#60a5fa] inline-block" /> Below average (trough)</span>
                        </div>
                      </div>
                    )}

                    {/* Demand Drivers */}
                    {enhancedForecast.demand_drivers?.length > 0 && (
                      <div className="bg-[#0a1628] rounded-lg p-4 border border-[#2d3a52]">
                        <p className="text-blue-400 text-sm font-medium mb-3">Demand Drivers</p>
                        <div className="space-y-3">
                          {enhancedForecast.demand_drivers.map((d: any, i: number) => (
                            <div key={i}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[#c8d0dc] text-sm">{d.factor}</span>
                                <span className="text-[#f1f5f9] text-sm font-semibold">{d.contribution_pct}%</span>
                              </div>
                              <div className="w-full h-2 bg-[#2d3a52] rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-[#d4af37] to-[#f59e0b]"
                                  style={{ width: `${Math.min(d.contribution_pct, 100)}%` }}
                                />
                              </div>
                              <p className="text-[#64748b] text-xs mt-0.5">{d.trend}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Metadata */}
                    <div className="bg-[#0a1628] rounded-lg p-3 border border-[#2d3a52]">
                      <p className="text-[#64748b] text-xs">
                        Generated by {enhancedForecast.metadata?.model || 'Claude Opus'} using {enhancedForecast.metadata?.data_points || 0} months of historical data
                        ({enhancedForecast.metadata?.data_period || 'N/A'}).
                        Processing time: {enhancedForecast.metadata?.processing_time_ms ? `${(enhancedForecast.metadata.processing_time_ms / 1000).toFixed(1)}s` : 'N/A'}.
                      </p>
                    </div>
                  </div>
                </CollapsibleSection>

                {/* AI Analysis Sections */}
                {enhancedForecast.briefing?.sections?.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-[#f1f5f9] font-medium text-lg">AI Analysis</h4>
                    {enhancedForecast.briefing.sections.map((section: any, i: number) => {
                      const emojiMap: Record<string, string> = {
                        'Demand Trajectory': '\u{1F4C8}',
                        'Seasonal Risk Windows': '\u{1F321}\uFE0F',
                        'Wales Transition': '\u{1F3D7}\uFE0F',
                        'Loss Reduction Impact': '\u26A1',
                      };
                      return (
                        <InsightCard
                          key={i}
                          card={{
                            emoji: emojiMap[section.title] || '\u{1F4CA}',
                            title: section.title,
                            severity: section.severity || 'stable',
                            summary: section.summary,
                            detail: section.detail,
                          }}
                        />
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              /* Fallback: No enhanced forecast available */
              <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] p-4 md:p-8 text-center">
                <Activity className="w-10 h-10 text-[#64748b] mx-auto mb-3" />
                <h4 className="text-[#f1f5f9] font-medium text-lg mb-2">Forecast Unavailable</h4>
                <p className="text-[#64748b] text-[15px] max-w-md mx-auto mb-4">
                  The enhanced forecast requires historical KPI data and an API key to generate projections.
                </p>
                <button
                  onClick={handleRegenerateEnhanced}
                  className="px-4 py-2 bg-[#d4af37] text-[#0a1628] rounded-lg font-medium hover:bg-[#c5a030] transition-colors"
                >
                  Generate Forecast
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default GPLDetail;
