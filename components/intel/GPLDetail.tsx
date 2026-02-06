'use client';

import { useState, useEffect, useMemo } from 'react';
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
    <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] p-5">
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
      <p className={`text-3xl font-bold ${target != null ? (atTarget ? 'text-emerald-400' : 'text-red-400') : 'text-[#f1f5f9]'}`}>
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
    <div className={`bg-[#1a2744] rounded-xl border border-[#2d3a52] border-l-4 ${trendStyles[trend]} p-5`}>
      <p className="text-[#64748b] text-[15px] mb-1">{title}</p>
      <p className="text-2xl font-bold text-[#f1f5f9]">{displayValue}</p>
    </div>
  );
}

// Severity config for briefing insight cards
const BRIEFING_SEVERITY: Record<string, { bg: string; text: string; border: string; label: string }> = {
  critical: { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30', label: 'Critical' },
  warning:  { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30', label: 'Warning' },
  stable:   { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30', label: 'Stable' },
  positive: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30', label: 'Good' },
};

interface BriefingSection {
  title: string;
  severity: string;
  summary: string;
  detail: string;
}

function BriefingInsightCard({ section }: { section: BriefingSection }) {
  const [expanded, setExpanded] = useState(false);
  const sev = BRIEFING_SEVERITY[section.severity] || BRIEFING_SEVERITY.stable;

  return (
    <div className={`bg-[#1a2744] rounded-xl border ${sev.border} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-4 py-3.5 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-lg font-semibold text-white">{section.title}</span>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium ${sev.bg} ${sev.text}`}>
              {sev.label}
            </span>
            <ChevronDown className={`w-4 h-4 text-[#64748b] transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          </div>
        </div>
        <p className="text-base text-[#c8d0dc] leading-snug">{section.summary}</p>
      </button>
      <div className={`collapse-grid ${expanded ? 'open' : ''}`}>
        <div>
          <div className="px-4 pb-4 pt-0">
            <div className="bg-[#0a1628] rounded-lg p-4 border border-[#2d3a52]">
              <p className="text-base text-[#94a3b8] leading-relaxed">{section.detail}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function GPLDetail({ data, onLoadDate }: GPLDetailProps) {
  // Tab state
  const [activeTab, setActiveTab] = useState<string>('overview');

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

  // Multivariate forecast state
  const [multiForecast, setMultiForecast] = useState<any>(null);
  const [multiForecastLoading, setMultiForecastLoading] = useState(true);
  const [selectedScenario, setSelectedScenario] = useState<'conservative' | 'aggressive'>('conservative');
  const [methodologyExpanded, setMethodologyExpanded] = useState(false);
  const [selectedGrid, setSelectedGrid] = useState<'dbis' | 'essequibo'>('dbis');

  // Fetch KPI data
  useEffect(() => {
    async function fetchKpiData() {
      setKpiLoading(true);
      try {
        const [latestRes, trendsRes, analysisRes] = await Promise.all([
          fetch(`${API_BASE}/gpl/kpi/latest`),
          fetch(`${API_BASE}/gpl/kpi/trends?months=12`),
          fetch(`${API_BASE}/gpl/kpi/analysis`)
        ]);
        const [latestData, trendsData, analysisData] = await Promise.all([
          latestRes.json(), trendsRes.json(), analysisRes.json()
        ]);
        setKpiData({
          latest: latestData.success && latestData.hasData ? latestData : null,
          trends: trendsData.success ? trendsData.trends : [],
          analysis: analysisData.success && analysisData.hasAnalysis ? analysisData.analysis : null
        });
      } catch (err) {
        console.error('Failed to fetch KPI data:', err);
      } finally {
        setKpiLoading(false);
      }
    }
    fetchKpiData();
  }, []);

  // Fetch forecast data (legacy + multivariate)
  useEffect(() => {
    async function fetchForecastData() {
      setForecastLoading(true);
      setMultiForecastLoading(true);
      try {
        // Fetch both legacy and multivariate forecasts
        const [legacyRes, multiRes] = await Promise.all([
          fetch(`${API_BASE}/gpl/forecast/all`),
          fetch(`${API_BASE}/gpl/forecast/multivariate`)
        ]);
        const [legacyData, multiData] = await Promise.all([
          legacyRes.json(),
          multiRes.json()
        ]);

        if (legacyData.success) {
          setForecastData(legacyData.data);
        }
        if (multiData.success && multiData.hasData) {
          setMultiForecast(multiData.forecast);
        }
      } catch (err) {
        console.error('Failed to fetch forecast data:', err);
      } finally {
        setForecastLoading(false);
        setMultiForecastLoading(false);
      }
    }
    fetchForecastData();
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
      availability: Math.round((totalAvailable / totalDerated) * 1000) / 10,
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
      <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] p-12 text-center">
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

  // Tab definitions
  const tabs = [
    { id: 'overview', label: 'System Overview' },
    { id: 'stations', label: 'Station Health' },
    { id: 'trends', label: 'Trends & KPIs' },
    { id: 'forecast', label: 'Forecast' }
  ];

  return (
    <div className="space-y-4">
      {/* PERSISTENT KPI STRIP */}
      <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${
              healthStatus === 'critical' ? 'bg-red-500 animate-pulse' :
              healthStatus === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'
            }`} />
            <span className="text-[#94a3b8] text-[15px] font-medium">System Health</span>
          </div>
          <div className="flex items-center gap-3">
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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Available Capacity */}
          <div className="flex items-center gap-3 p-4 bg-[#0a1628] rounded-lg border-l-4 border-emerald-500">
            <div>
              <p className="text-[#64748b] text-[15px]">Available Capacity</p>
              <p className="text-2xl font-bold text-[#f1f5f9]">{summary.totalAvailable}<span className="text-base font-normal text-[#64748b]"> / {summary.totalDerated} MW</span></p>
            </div>
          </div>

          {/* Reserve Margin */}
          <div className={`flex items-center gap-3 p-4 bg-[#0a1628] rounded-lg border-l-4 ${
            reserveMargin < 10 ? 'border-red-500' : reserveMargin < 15 ? 'border-amber-500' : 'border-emerald-500'
          }`}>
            <div>
              <p className="text-[#64748b] text-[15px]">Reserve Margin</p>
              <p className={`text-2xl font-bold ${
                reserveMargin < 10 ? 'text-red-400' : reserveMargin < 15 ? 'text-amber-400' : 'text-emerald-400'
              }`}>{reserveMargin.toFixed(1)}%</p>
              <p className="text-[#64748b] text-xs">{reserveMargin < 15 ? 'Below 15% safe threshold' : 'Adequate'}</p>
            </div>
          </div>

          {/* Offline Capacity */}
          <div className={`flex items-center gap-3 p-4 bg-[#0a1628] rounded-lg border-l-4 ${
            summary.offline.length > 0 ? 'border-red-500' : 'border-[#2d3a52]'
          }`}>
            <div>
              <p className="text-[#64748b] text-[15px]">Offline Capacity</p>
              <p className="text-2xl font-bold text-red-400">{summary.totalOffline} MW</p>
              <p className="text-[#64748b] text-xs">{summary.offline.length} stations offline</p>
            </div>
          </div>

          {/* Peak Demand */}
          <div className="flex items-center gap-3 p-4 bg-[#0a1628] rounded-lg border-l-4 border-purple-500">
            <div>
              <p className="text-[#64748b] text-[15px]">Peak Demand (Evening)</p>
              <p className="text-2xl font-bold text-purple-400">{eveningPeak || '-'} MW</p>
              <p className="text-[#64748b] text-xs">{data.peakDemandDate || '-'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* TAB BAR */}
      <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] p-1.5 overflow-x-auto scrollbar-hide">
        <div className="flex gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-4 py-2.5 rounded-lg text-base font-medium transition-all whitespace-nowrap ${
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

      {/* TAB CONTENT */}
      <div className="min-h-[400px]">

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
                <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] p-4">
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
                        <p className="text-[#f1f5f9] text-xs font-medium truncate">{station.name}</p>
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
              <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] p-4">
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
                      <p className="text-3xl font-bold text-[#f1f5f9]">{summary.availability}%</p>
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

            {/* AI Executive Briefing — Progressive Disclosure */}
            {(() => {
              // Resolve briefing data: handle both camelCase (API) and snake_case (legacy)
              const rawBriefing = data.aiAnalysis?.executiveBriefing || data.aiAnalysis?.executive_briefing;
              if (!rawBriefing) return null;

              // Parse: structured object (new) vs plain string (legacy)
              const briefing: { headline: string; sections: BriefingSection[] } =
                typeof rawBriefing === 'object' && rawBriefing.headline
                  ? rawBriefing
                  : typeof rawBriefing === 'string'
                    ? {
                        headline: rawBriefing.split('\n')[0]?.slice(0, 250) || 'System analysis available.',
                        sections: [{ title: 'Full Analysis', severity: 'stable', summary: rawBriefing.split('\n')[1]?.slice(0, 120) || '', detail: rawBriefing }],
                      }
                    : { headline: 'System analysis available.', sections: [] };

              const critAlerts = data.aiAnalysis?.criticalAlerts || data.aiAnalysis?.critical_alerts || [];

              return (
                <div className="space-y-3">
                  {/* HEADLINE — always visible, newspaper style */}
                  <div className="bg-gradient-to-r from-[#1a2744] to-[#2d3a52]/80 rounded-xl border border-[#d4af37]/20 p-5">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shrink-0 mt-0.5">
                        <Activity className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-[#d4af37] font-semibold mb-1.5">AI Executive Briefing</p>
                        <p className="text-[22px] font-bold text-[#f1f5f9] leading-snug">{briefing.headline}</p>
                      </div>
                    </div>
                  </div>

                  {/* INSIGHT CARDS — all collapsed */}
                  {briefing.sections.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {briefing.sections.map((section, i) => (
                        <BriefingInsightCard key={i} section={section} />
                      ))}
                    </div>
                  )}

                  {/* CRITICAL ALERTS — collapsed */}
                  {critAlerts.length > 0 && (
                    <CollapsibleSection
                      title={`Critical Alerts (${critAlerts.length})`}
                      icon={AlertTriangle}
                      badge={{ text: `${critAlerts.length}`, variant: 'danger' }}
                      defaultOpen={false}
                    >
                      <div className="space-y-2">
                        {critAlerts.map((alert: any, i: number) => (
                          <div key={i} className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-semibold text-red-300">{alert.title}</span>
                              <span className="text-[10px] uppercase px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded font-medium">
                                {alert.severity || 'CRITICAL'}
                              </span>
                            </div>
                            <p className="text-[#94a3b8] text-sm">{alert.description}</p>
                            {alert.recommendation && (
                              <p className="text-blue-400 text-sm mt-1.5">→ {alert.recommendation}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </CollapsibleSection>
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
                    } p-5`}
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
                      <span className="text-3xl font-bold text-[#f1f5f9]">{station.available}</span>
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
                      <span>{station.availability.toFixed(0)}% available</span>
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
                    <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] p-4">
                      <h4 className="text-[#f1f5f9] font-medium text-lg mb-4">Peak Demand Trends</h4>
                      <div className="h-72">
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
                    <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] p-4">
                      <h4 className="text-[#f1f5f9] font-medium text-lg mb-4">Collection Rate Performance</h4>
                      <div className="h-80">
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
            {/* Header with Refresh Button */}
            <div className="flex items-center justify-between">
              <h3 className="text-[#f1f5f9] font-medium text-[22px]">Predictive Analytics</h3>
              <button
                onClick={handleRefreshForecast}
                disabled={refreshingForecast}
                className="px-4 py-2 bg-[#1a2744] hover:bg-[#2d3a52] text-[#94a3b8] rounded-lg flex items-center gap-2 text-base border border-[#2d3a52] disabled:opacity-50"
              >
                <RefreshCw size={16} className={refreshingForecast ? 'animate-spin' : ''} />
                {refreshingForecast ? 'Refreshing...' : 'Refresh Forecasts'}
              </button>
            </div>

            {(forecastLoading || multiForecastLoading) ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <RefreshCw className="w-8 h-8 text-[#d4af37] animate-spin" />
                <p className="text-[#94a3b8] text-sm">
                  {refreshingForecast ? 'Generating forecast analysis with Claude Opus...' : 'Loading forecasts...'}
                </p>
              </div>
            ) : (
              <>
                {/* Scenario Toggle */}
                <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="text-[#f1f5f9] font-medium text-base mb-1">Forecast Scenario</h4>
                      <p className="text-[#64748b] text-[15px]">
                        {selectedScenario === 'conservative'
                          ? 'Historical trend extrapolation — assumes no major demand changes'
                          : 'Factors in oil & gas expansion, commercial growth, and housing programs'}
                      </p>
                    </div>
                    <div className="flex bg-[#0a1628] rounded-lg p-1 border border-[#2d3a52]">
                      <button
                        onClick={() => setSelectedScenario('conservative')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                          selectedScenario === 'conservative'
                            ? 'bg-[#d4af37] text-[#0a1628]'
                            : 'text-[#94a3b8] hover:text-[#f1f5f9]'
                        }`}
                      >
                        Conservative
                      </button>
                      <button
                        onClick={() => setSelectedScenario('aggressive')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                          selectedScenario === 'aggressive'
                            ? 'bg-[#d4af37] text-[#0a1628]'
                            : 'text-[#94a3b8] hover:text-[#f1f5f9]'
                        }`}
                      >
                        Aggressive
                      </button>
                    </div>
                  </div>
                  {multiForecast?.metadata?.isFallback && (
                    <div className="mt-3 bg-blue-500/10 border border-blue-500/30 rounded-lg p-2 flex items-center gap-2">
                      <Info className="w-4 h-4 text-blue-400" />
                      <span className="text-blue-300 text-xs">AI forecast unavailable — showing linear extrapolation</span>
                    </div>
                  )}
                </div>

                {/* Forecast KPI Cards */}
                {(() => {
                  // Get scenario data from multivariate forecast
                  const scenarioData = multiForecast?.[selectedScenario];
                  const gridData = scenarioData?.dbis;

                  // Get 6-month projection data
                  const month6Data = gridData?.month_6;
                  const currentPeak = gridData?.current_peak || computedProjections.currentDbis;
                  const capacity = 230; // DBIS capacity

                  // Calculate values with proper fallbacks
                  let peakMw: number = month6Data?.peak_mw;
                  let forecastReserveMargin: number = month6Data?.reserve_margin_pct;

                  // If no multivariate data, use computed projections
                  if (peakMw === undefined || peakMw === null) {
                    peakMw = computedProjections.dbis['6mo'];
                    forecastReserveMargin = ((capacity - peakMw) / capacity) * 100;
                  }

                  // Ensure reserve margin is a valid number
                  if (forecastReserveMargin === undefined || forecastReserveMargin === null || isNaN(forecastReserveMargin)) {
                    forecastReserveMargin = ((capacity - peakMw) / capacity) * 100;
                  }

                  const breachDate: string | null = gridData?.safe_threshold_breach_date || null;
                  const sheddingDate: string | null = gridData?.load_shedding_unavoidable_date || null;

                  // Determine urgency colors
                  const getUrgencyTrend = (dateStr: string | null): 'danger' | 'warning' | 'success' | 'normal' => {
                    if (!dateStr) return 'success';
                    // Parse YYYY-MM format
                    const match = String(dateStr).match(/^(\d{4})-(\d{2})$/);
                    if (!match) return 'normal';
                    const targetDate = new Date(parseInt(match[1]), parseInt(match[2]) - 1);
                    const months = Math.round((targetDate.getTime() - new Date().getTime()) / (30 * 24 * 60 * 60 * 1000));
                    if (months <= 6) return 'danger';
                    if (months <= 12) return 'warning';
                    return 'normal';
                  };

                  return (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <ForecastMetricCard
                        title="Projected Peak (6mo)"
                        value={peakMw}
                        unit=" MW"
                        trend={forecastReserveMargin < 15 ? 'warning' : 'normal'}
                      />
                      <ForecastMetricCard
                        title="Reserve Margin (6mo)"
                        value={forecastReserveMargin}
                        unit="%"
                        trend={forecastReserveMargin < 10 ? 'danger' : forecastReserveMargin < 15 ? 'warning' : 'success'}
                      />
                      <ForecastMetricCard
                        title="15% Threshold Breach"
                        value={breachDate || 'Not projected'}
                        isDate={!!breachDate}
                        trend={getUrgencyTrend(breachDate)}
                      />
                      <ForecastMetricCard
                        title="Load Shedding Risk"
                        value={sheddingDate || 'Low risk'}
                        isDate={!!sheddingDate}
                        trend={getUrgencyTrend(sheddingDate)}
                      />
                    </div>
                  );
                })()}

                {/* Grid Toggle for Charts */}
                <div className="flex items-center gap-2">
                  <span className="text-[#94a3b8] text-sm">Grid:</span>
                  <div className="flex bg-[#1a2744] rounded-lg p-1 border border-[#2d3a52]">
                    <button
                      onClick={() => setSelectedGrid('dbis')}
                      className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
                        selectedGrid === 'dbis'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'text-[#94a3b8] hover:text-[#f1f5f9]'
                      }`}
                    >
                      DBIS
                    </button>
                    <button
                      onClick={() => setSelectedGrid('essequibo')}
                      className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
                        selectedGrid === 'essequibo'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'text-[#94a3b8] hover:text-[#f1f5f9]'
                      }`}
                    >
                      Essequibo
                    </button>
                  </div>
                </div>

                {/* Dual-Scenario Trajectory Chart */}
                <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-[#f1f5f9] font-medium text-base">
                      {selectedGrid === 'dbis' ? 'DBIS' : 'Essequibo'} Demand Trajectory
                    </h4>
                    <span className="text-xs text-[#64748b]">
                      Shaded area = planning envelope
                    </span>
                  </div>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      {(() => {
                        const conservData = multiForecast?.conservative?.[selectedGrid];
                        const aggressData = multiForecast?.aggressive?.[selectedGrid];
                        const fallbackData = computedProjections[selectedGrid === 'dbis' ? 'dbis' : 'esq'];
                        const currentPeak = selectedGrid === 'dbis' ? computedProjections.currentDbis : computedProjections.currentEsq;
                        const capacity = selectedGrid === 'dbis' ? 230 : 36;

                        // Helper to calculate aggressive fallback properly: current + 1.5x growth
                        const calcAggressiveFallback = (conservativePeak: number) => {
                          const growth = conservativePeak - currentPeak;
                          return currentPeak + (growth * 1.5);
                        };

                        // Get conservative peak with fallback
                        const getConservPeak = (monthKey: string, fallbackKey: '6mo' | '12mo' | '24mo') => {
                          if (conservData?.[monthKey]?.peak_mw != null) return conservData[monthKey].peak_mw;
                          return fallbackData?.[fallbackKey] || currentPeak;
                        };

                        // Get aggressive peak with fallback
                        const getAggressPeak = (monthKey: string, conservPeak: number) => {
                          if (aggressData?.[monthKey]?.peak_mw != null) return aggressData[monthKey].peak_mw;
                          return calcAggressiveFallback(conservPeak);
                        };

                        const c6 = getConservPeak('month_6', '6mo');
                        const c12 = getConservPeak('month_12', '12mo');
                        const c18 = conservData?.month_18?.peak_mw ?? (c6 + c12) / 2 + (c12 - c6) / 2;
                        const c24 = getConservPeak('month_24', '24mo');

                        // Build chart data with historical + projections
                        const chartData = [
                          { period: 'Current', conservative: currentPeak, aggressive: currentPeak },
                          { period: '6 mo', conservative: c6, aggressive: getAggressPeak('month_6', c6) },
                          { period: '12 mo', conservative: c12, aggressive: getAggressPeak('month_12', c12) },
                          { period: '18 mo', conservative: c18, aggressive: getAggressPeak('month_18', c18) },
                          { period: '24 mo', conservative: c24, aggressive: getAggressPeak('month_24', c24) }
                        ];

                        return (
                          <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2d3a52" />
                            <XAxis dataKey="period" stroke="#94a3b8" tick={{ fontSize: 13 }} />
                            <YAxis stroke="#94a3b8" tick={{ fontSize: 13 }} domain={['auto', 'auto']} />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', fontSize: '14px' }}
                              labelStyle={{ color: '#f1f5f9' }}
                              formatter={(v: any, name: string) => [`${v?.toFixed(1)} MW`, name === 'conservative' ? 'Conservative' : 'Aggressive']}
                            />
                            <Legend wrapperStyle={{ fontSize: '14px' }} />
                            <ReferenceLine y={capacity} stroke="#ef4444" strokeDasharray="8 4" label={{ value: `Capacity: ${capacity} MW`, fill: '#ef4444', fontSize: 12, position: 'right' }} />
                            <ReferenceLine y={capacity * 0.85} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: '15% Reserve', fill: '#f59e0b', fontSize: 11, position: 'right' }} />
                            <Area type="monotone" dataKey="aggressive" fill={selectedGrid === 'dbis' ? '#f59e0b' : '#10b981'} fillOpacity={0.1} stroke="none" legendType="none" />
                            <Line type="monotone" dataKey="conservative" stroke={selectedGrid === 'dbis' ? '#f59e0b' : '#10b981'} strokeWidth={2} dot={{ fill: selectedGrid === 'dbis' ? '#f59e0b' : '#10b981', r: 4 }} name="Conservative" />
                            <Line type="monotone" dataKey="aggressive" stroke={selectedGrid === 'dbis' ? '#fb923c' : '#34d399'} strokeWidth={2} strokeDasharray="5 5" dot={{ fill: selectedGrid === 'dbis' ? '#fb923c' : '#34d399', r: 4 }} name="Aggressive" />
                          </ComposedChart>
                        );
                      })()}
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Scenario Comparison Table */}
                <CollapsibleSection
                  title={`Scenario Comparison — ${selectedGrid === 'dbis' ? 'DBIS Grid' : 'Essequibo Grid'}`}
                  icon={Activity}
                  defaultOpen={false}
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#2d3a52] bg-[#0a1628]">
                          <th className="text-left py-3 px-4 text-[#94a3b8] font-medium">Timeframe</th>
                          <th className="text-right py-3 px-4 text-[#94a3b8] font-medium">Conservative Peak</th>
                          <th className="text-right py-3 px-4 text-[#94a3b8] font-medium">Aggressive Peak</th>
                          <th className="text-right py-3 px-4 text-[#94a3b8] font-medium">Capacity</th>
                          <th className="text-right py-3 px-4 text-[#94a3b8] font-medium">Cons. Reserve</th>
                          <th className="text-right py-3 px-4 text-[#94a3b8] font-medium">Aggr. Reserve</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const conserv: any = multiForecast?.conservative?.[selectedGrid] || {};
                          const aggress: any = multiForecast?.aggressive?.[selectedGrid] || {};
                          const capacity = selectedGrid === 'dbis' ? 230 : 36;
                          const currentPeak = selectedGrid === 'dbis' ? computedProjections.currentDbis : computedProjections.currentEsq;
                          const gridKey = selectedGrid === 'dbis' ? 'dbis' : 'esq' as const;

                          // Calculate proper aggressive fallback: current + 1.5x growth (not 1.5x total)
                          // Growth = projection - current, so aggressive = current + 1.5 * growth
                          const calcAggressiveFallback = (conservativePeak: number) => {
                            const growth = conservativePeak - currentPeak;
                            return currentPeak + (growth * 1.5);
                          };

                          const rows = [
                            {
                              period: 'Current',
                              cKey: 'current_peak',
                              aKey: 'current_peak',
                              fallbackC: currentPeak,
                              fallbackA: currentPeak
                            },
                            {
                              period: '6 months',
                              cKey: 'month_6',
                              aKey: 'month_6',
                              fallbackC: computedProjections[gridKey]['6mo'],
                              fallbackA: calcAggressiveFallback(computedProjections[gridKey]['6mo'])
                            },
                            {
                              period: '12 months',
                              cKey: 'month_12',
                              aKey: 'month_12',
                              fallbackC: computedProjections[gridKey]['12mo'],
                              fallbackA: calcAggressiveFallback(computedProjections[gridKey]['12mo'])
                            },
                            {
                              period: '18 months',
                              cKey: 'month_18',
                              aKey: 'month_18',
                              fallbackC: (computedProjections[gridKey]['12mo'] + computedProjections[gridKey]['24mo']) / 2,
                              fallbackA: calcAggressiveFallback((computedProjections[gridKey]['12mo'] + computedProjections[gridKey]['24mo']) / 2)
                            },
                            {
                              period: '24 months',
                              cKey: 'month_24',
                              aKey: 'month_24',
                              fallbackC: computedProjections[gridKey]['24mo'],
                              fallbackA: calcAggressiveFallback(computedProjections[gridKey]['24mo'])
                            }
                          ];

                          const getReserveClass = (reserve: number): string => {
                            if (reserve >= 20) return 'text-emerald-400 bg-emerald-500/10';
                            if (reserve >= 15) return 'text-amber-400 bg-amber-500/10';
                            return 'text-red-400 bg-red-500/10';
                          };

                          return rows.map(row => {
                            const cPeak = row.cKey === 'current_peak' ? (conserv[row.cKey] || row.fallbackC) : (conserv[row.cKey]?.peak_mw || row.fallbackC);
                            const aPeak = row.aKey === 'current_peak' ? (aggress[row.aKey] || row.fallbackA) : (aggress[row.aKey]?.peak_mw || row.fallbackA);
                            const cReserve = ((capacity - cPeak) / capacity) * 100;
                            const aReserve = ((capacity - aPeak) / capacity) * 100;

                            return (
                              <tr key={row.period} className="border-b border-[#2d3a52]/50">
                                <td className="py-3 px-4 text-[#f1f5f9] font-medium">{row.period}</td>
                                <td className="py-3 px-4 text-right text-[#f1f5f9]">{cPeak?.toFixed(1)} MW</td>
                                <td className="py-3 px-4 text-right text-[#f1f5f9]">{aPeak?.toFixed(1)} MW</td>
                                <td className="py-3 px-4 text-right text-[#64748b]">{capacity} MW</td>
                                <td className={`py-3 px-4 text-right font-medium rounded ${getReserveClass(cReserve)}`}>{cReserve.toFixed(1)}%</td>
                                <td className={`py-3 px-4 text-right font-medium rounded ${getReserveClass(aReserve)}`}>{aReserve.toFixed(1)}%</td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                </CollapsibleSection>

                {/* Demand Drivers */}
                {multiForecast?.demand_drivers && (
                  <CollapsibleSection
                    title="Demand Drivers"
                    icon={TrendingUp}
                    defaultOpen={false}
                  >
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { key: 'industrial', icon: Factory, color: 'text-amber-400', bg: 'bg-amber-500/10' },
                        { key: 'commercial', icon: Building2, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                        { key: 'residential', icon: Home, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                        { key: 'seasonal', icon: Thermometer, color: 'text-purple-400', bg: 'bg-purple-500/10' }
                      ].map(({ key, icon: DIcon, color, bg }) => {
                        const driver = multiForecast.demand_drivers[key];
                        if (!driver) return null;
                        return (
                          <div key={key} className={`${bg} rounded-xl border border-[#2d3a52] p-4`}>
                            <div className="flex items-center gap-2 mb-2">
                              <DIcon className={`w-5 h-5 ${color}`} />
                              <span className={`text-sm font-medium ${color} capitalize`}>{key}</span>
                            </div>
                            <p className="text-[#f1f5f9] text-xs font-medium mb-1">{driver.impact}</p>
                            <p className="text-[#64748b] text-xs">{driver.factors?.slice(0, 2).join(', ')}</p>
                          </div>
                        );
                      })}
                    </div>
                  </CollapsibleSection>
                )}

                {/* Methodology & Assumptions Panel */}
                <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] overflow-hidden">
                  <button
                    onClick={() => setMethodologyExpanded(!methodologyExpanded)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-[#2d3a52]/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
                        <Info className="w-5 h-5 text-white" />
                      </div>
                      <div className="text-left">
                        <h3 className="text-[#f1f5f9] font-medium text-base">Forecast Methodology</h3>
                        <p className="text-[#64748b] text-sm">Click to {methodologyExpanded ? 'collapse' : 'expand'}</p>
                      </div>
                    </div>
                    <ChevronDown className={`text-[#64748b] transition-transform ${methodologyExpanded ? 'rotate-180' : ''}`} size={18} />
                  </button>

                  {methodologyExpanded && (
                    <div className="px-4 pb-4 space-y-4">
                      {/* Methodology Summary */}
                      <div className="bg-[#0a1628] rounded-lg p-4 border border-[#2d3a52]">
                        <p className="text-blue-400 text-sm font-medium mb-2">Methodology</p>
                        <p className="text-[#94a3b8] text-sm leading-relaxed">
                          {multiForecast?.methodology_summary || 'Linear extrapolation based on historical monthly growth rates.'}
                        </p>
                      </div>

                      {/* Assumptions for Selected Scenario */}
                      <div className="bg-[#0a1628] rounded-lg p-4 border border-[#2d3a52]">
                        <p className="text-blue-400 text-sm font-medium mb-2">
                          {selectedScenario === 'conservative' ? 'Conservative' : 'Aggressive'} Assumptions
                        </p>
                        <ul className="space-y-1">
                          {(multiForecast?.[selectedScenario]?.assumptions || []).map((assumption: string, i: number) => (
                            <li key={i} className="text-[#94a3b8] text-sm flex items-start gap-2">
                              <span className="text-blue-400">&#8226;</span>
                              <span>{assumption}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Risk Factors */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-red-500/10 rounded-lg p-4 border border-red-500/20">
                          <p className="text-red-400 text-sm font-medium mb-2">Upside Risk Factors</p>
                          <ul className="space-y-1">
                            {(multiForecast?.[selectedScenario]?.risk_factors_upside || []).map((factor: string, i: number) => (
                              <li key={i} className="text-[#94a3b8] text-xs flex items-start gap-2">
                                <TrendingUp className="w-3 h-3 text-red-400 mt-0.5" />
                                <span>{factor}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="bg-emerald-500/10 rounded-lg p-4 border border-emerald-500/20">
                          <p className="text-emerald-400 text-sm font-medium mb-2">Moderating Factors</p>
                          <ul className="space-y-1">
                            {(multiForecast?.[selectedScenario]?.moderating_factors || []).map((factor: string, i: number) => (
                              <li key={i} className="text-[#94a3b8] text-xs flex items-start gap-2">
                                <TrendingDown className="w-3 h-3 text-emerald-400 mt-0.5" />
                                <span>{factor}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      {/* Disclaimer */}
                      <div className="bg-[#0a1628] rounded-lg p-3 border border-[#2d3a52]">
                        <p className="text-[#64748b] text-xs">
                          Projections generated by {multiForecast?.metadata?.isFallback ? 'linear extrapolation' : 'AI analysis (Claude Opus)'} of historical GPL data supplemented with macroeconomic context.
                          Actual demand will vary. Updated: {multiForecast?.metadata?.generatedAt ? new Date(multiForecast.metadata.generatedAt).toLocaleString() : 'N/A'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Executive Summary */}
                {multiForecast?.executive_summary && (
                  <div className="bg-gradient-to-r from-[#1a2744] to-[#2d3a52] rounded-xl border border-[#d4af37]/30 p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-[#d4af37]/20 flex items-center justify-center flex-shrink-0">
                        <Zap className="w-5 h-5 text-[#d4af37]" />
                      </div>
                      <div>
                        <h4 className="text-[#d4af37] font-medium text-sm mb-1">Executive Summary</h4>
                        <p className="text-[#f1f5f9] text-sm leading-relaxed">{multiForecast.executive_summary}</p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default GPLDetail;
