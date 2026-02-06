'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, ReferenceLine, ComposedChart
} from 'recharts';
import {
  TrendingUp, TrendingDown, Minus, Users, Zap, DollarSign,
  Fuel, Upload, AlertTriangle, Sparkles, RefreshCw, Shield,
  ChevronDown, CheckCircle2, Clock, ArrowRight,
  type LucideIcon
} from 'lucide-react';
import { GPLKpiUpload } from './GPLKpiUpload';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';

const API_BASE = '/api';

interface KpiData {
  value: number | null;
  previousValue: number | null;
  changePct: number | null;
}

interface KpiCardProps {
  name: string;
  icon: any;
  data: KpiData | null;
}

// --- Icon map for AI sections ---
const SECTION_ICONS: Record<string, LucideIcon> = {
  'zap': Zap,
  'fuel': Fuel,
  'dollar-sign': DollarSign,
  'users': Users,
  'trending-up': TrendingUp,
  'alert-triangle': AlertTriangle,
  'shield': Shield,
  'sparkles': Sparkles,
};

const SEVERITY_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  critical: { label: 'Critical', bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30' },
  warning:  { label: 'Warning',  bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
  stable:   { label: 'Stable',   bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30' },
  positive: { label: 'Positive', bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
};

const URGENCY_CONFIG: Record<string, { icon: LucideIcon; color: string }> = {
  immediate:  { icon: AlertTriangle, color: 'text-red-400' },
  'short-term': { icon: Clock, color: 'text-amber-400' },
  'long-term':  { icon: ArrowRight, color: 'text-blue-400' },
};

function InsightCard({ section }: { section: any }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = SECTION_ICONS[section.icon] || Sparkles;
  const severity = SEVERITY_CONFIG[section.severity] || SEVERITY_CONFIG.stable;

  return (
    <div className={`card-premium rounded-xl border ${severity.border} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-4 py-3.5 flex items-start gap-3 hover:bg-white/[0.02] transition-colors"
      >
        <div className={`w-9 h-9 rounded-lg ${severity.bg} flex items-center justify-center shrink-0 mt-0.5`}>
          <Icon className={`w-4.5 h-4.5 ${severity.text}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[15px] font-semibold text-white">{section.title}</span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium ${severity.bg} ${severity.text}`}>
              {severity.label}
            </span>
          </div>
          <p className="text-[15px] text-[#c8d0dc] font-medium leading-snug">{section.summary}</p>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-[#64748b] shrink-0 mt-1 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        />
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-0">
          <div className="ml-12 text-sm text-[#94a3b8] leading-relaxed">
            {section.detail}
          </div>
        </div>
      )}
    </div>
  );
}

function ActionItemsCard({ items }: { items: any[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card-premium rounded-xl border border-[#d4af37]/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-4 py-3.5 flex items-center gap-3 hover:bg-white/[0.02] transition-colors"
      >
        <div className="w-9 h-9 rounded-lg bg-[#d4af37]/15 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-4.5 h-4.5 text-[#d4af37]" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[15px] font-semibold text-white">Key Action Items</span>
          <span className="ml-2 text-xs text-[#64748b]">{items.length} recommendations</span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-[#64748b] shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        />
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-0 space-y-2.5">
          {items.map((item: any, i: number) => {
            const urgency = URGENCY_CONFIG[item.urgency] || URGENCY_CONFIG['short-term'];
            const UrgencyIcon = urgency.icon;
            return (
              <div key={i} className="ml-12 flex items-start gap-3 group">
                <UrgencyIcon className={`w-4 h-4 ${urgency.color} shrink-0 mt-0.5`} />
                <div className="min-w-0">
                  <p className="text-sm text-white font-medium">{item.action}</p>
                  <p className="text-xs text-[#64748b] mt-0.5">{item.impact}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function GPLMonthlyKpi() {
  const [showUpload, setShowUpload] = useState(false);
  const [latestKpis, setLatestKpis] = useState<any>(null);
  const [trends, setTrends] = useState<any[]>([]);
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all data
  const fetchData = async () => {
    setLoading(true);
    try {
      const [latestRes, trendsRes, analysisRes] = await Promise.all([
        fetch(`${API_BASE}/gpl/kpi/latest`),
        fetch(`${API_BASE}/gpl/kpi/trends?months=36`),
        fetch(`${API_BASE}/gpl/kpi/analysis`)
      ]);

      const [latestData, trendsData, analysisData] = await Promise.all([
        latestRes.json(),
        trendsRes.json(),
        analysisRes.json()
      ]);

      if (latestData.success && latestData.hasData) {
        setLatestKpis(latestData);
      }

      if (trendsData.success) {
        setTrends(trendsData.trends);
      }

      if (analysisData.success && analysisData.hasAnalysis) {
        setAnalysis(analysisData.analysis);
      }

    } catch (err: any) {
      console.error('Failed to fetch KPI data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleUploadSuccess = (result: any) => {
    setShowUpload(false);
    fetchData(); // Refresh data
  };

  // Format values for display
  const formatValue = (kpi: string, value: number | null | undefined) => {
    if (value === null || value === undefined) return 'N/A';
    if (kpi.includes('%')) return `${value.toFixed(1)}%`;
    if (kpi.includes('Capacity') || kpi.includes('Demand')) return `${value.toFixed(1)} MW`;
    if (kpi.includes('Customers')) return Math.round(value).toLocaleString();
    return value.toFixed(2);
  };

  // Get trend icon and color
  const getTrendIndicator = (kpi: string, changePct: number | null | undefined) => {
    if (changePct === null || changePct === undefined) {
      return { icon: Minus, color: 'text-[#94a3b8]', bg: 'bg-[#64748b]/20' };
    }

    // For Affected Customers, down is good
    const isPositiveGood = !kpi.includes('Affected Customers');
    const isUp = changePct > 0;
    const isGood = isPositiveGood ? isUp : !isUp;

    return {
      icon: isUp ? TrendingUp : TrendingDown,
      color: isGood ? 'text-emerald-400' : 'text-red-400',
      bg: isGood ? 'bg-emerald-500/20' : 'bg-red-500/20'
    };
  };

  // Prepare chart data
  const chartData = useMemo(() => {
    return trends.map((row: any) => ({
      ...row,
      monthLabel: row.month?.slice(0, 7), // YYYY-MM
      'Peak Demand DBIS': row['Peak Demand DBIS'],
      'Peak Demand Essequibo': row['Peak Demand Essequibo'],
      'Installed Capacity DBIS': row['Installed Capacity DBIS'],
      'Installed Capacity Essequibo': row['Installed Capacity Essequibo'],
      'HFO Generation Mix %': row['HFO Generation Mix %'],
      'LFO Generation Mix %': row['LFO Generation Mix %'],
      'Affected Customers': row['Affected Customers'],
      'Collection Rate %': row['Collection Rate %']
    }));
  }, [trends]);

  // If loading
  if (loading && !latestKpis && trends.length === 0) {
    return (
      <div className="bg-[#1a2744]/50 rounded-xl p-8 border border-[#2d3a52] text-center">
        <RefreshCw className="w-8 h-8 text-[#64748b] animate-spin mx-auto mb-4" />
        <p className="text-[#94a3b8]">Loading KPI data...</p>
      </div>
    );
  }

  // If no data
  if (!latestKpis && trends.length === 0 && !loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[22px] font-semibold text-white">GPL Monthly Performance</h3>
          <button
            onClick={() => setShowUpload(true)}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg flex items-center gap-2 text-sm"
          >
            <Upload className="w-4 h-4" />
            Upload KPI CSV
          </button>
        </div>

        {showUpload ? (
          <GPLKpiUpload
            onSuccess={handleUploadSuccess}
            onCancel={() => setShowUpload(false)}
          />
        ) : (
          <div className="bg-[#1a2744]/50 rounded-xl p-8 border border-[#2d3a52] text-center">
            <Zap className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-[#94a3b8] mb-2">No monthly KPI data available</p>
            <p className="text-[#64748b] text-sm">Upload a KPI CSV file to see monthly trends</p>
          </div>
        )}
      </div>
    );
  }

  // KPI card component
  const KpiCard = ({ name, icon: Icon, data }: KpiCardProps) => {
    if (!data) return null;
    const trend = getTrendIndicator(name, data.changePct);
    const TrendIcon = trend.icon;

    return (
      <div className="bg-[#1a2744]/80 rounded-xl p-4 border border-[#2d3a52]">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#2d3a52]/50 flex items-center justify-center">
              <Icon className="w-4 h-4 text-[#94a3b8]" />
            </div>
            <span className="text-[#94a3b8] text-sm">{name}</span>
          </div>
          {data.changePct !== null && (
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded ${trend.bg}`}>
              <TrendIcon className={`w-3 h-3 ${trend.color}`} />
              <span className={`text-xs ${trend.color}`}>
                {Math.abs(data.changePct).toFixed(1)}%
              </span>
            </div>
          )}
        </div>
        <p className="text-2xl font-bold text-white">
          {formatValue(name, data.value)}
        </p>
        {data.previousValue !== null && (
          <p className="text-xs text-[#64748b] mt-1">
            vs {formatValue(name, data.previousValue)} last month
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[22px] font-semibold text-white">GPL Monthly Performance</h3>
          {latestKpis?.reportMonth && (
            <p className="text-[#64748b] text-sm">
              Latest data: {latestKpis.reportMonth.slice(0, 7)}
            </p>
          )}
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg flex items-center gap-2 text-sm"
        >
          <Upload className="w-4 h-4" />
          Upload KPI CSV
        </button>
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <GPLKpiUpload
          onSuccess={handleUploadSuccess}
          onCancel={() => setShowUpload(false)}
        />
      )}

      {/* KPI Cards */}
      {latestKpis?.kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <KpiCard name="Peak Demand DBIS" icon={Zap} data={latestKpis.kpis['Peak Demand DBIS']} />
          <KpiCard name="Peak Demand Essequibo" icon={Zap} data={latestKpis.kpis['Peak Demand Essequibo']} />
          <KpiCard name="Installed Capacity DBIS" icon={Zap} data={latestKpis.kpis['Installed Capacity DBIS']} />
          <KpiCard name="Installed Capacity Essequibo" icon={Zap} data={latestKpis.kpis['Installed Capacity Essequibo']} />
          <KpiCard name="Affected Customers" icon={Users} data={latestKpis.kpis['Affected Customers']} />
          <KpiCard name="Collection Rate %" icon={DollarSign} data={latestKpis.kpis['Collection Rate %']} />
        </div>
      )}

      {/* Charts — collapsible */}
      {chartData.length > 0 && (
        <CollapsibleSection
          title="Trend Charts"
          icon={TrendingUp}
          badge={{ text: '5 charts', variant: 'info' }}
          defaultOpen={false}
        >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Peak Demand Chart */}
          <div className="bg-[#1a2744]/80 rounded-xl p-4 border border-[#2d3a52]">
            <h4 className="text-white font-medium text-lg mb-4">Peak Demand Trends</h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    dataKey="monthLabel"
                    stroke="#94a3b8"
                    tick={{ fontSize: 10 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '8px'
                    }}
                    labelStyle={{ color: '#f1f5f9' }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="Peak Demand DBIS"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={false}
                    name="DBIS"
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="Peak Demand Essequibo"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                    name="Essequibo"
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Installed Capacity Chart */}
          <div className="bg-[#1a2744]/80 rounded-xl p-4 border border-[#2d3a52]">
            <h4 className="text-white font-medium text-lg mb-4">Installed Capacity</h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    dataKey="monthLabel"
                    stroke="#94a3b8"
                    tick={{ fontSize: 10 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '8px'
                    }}
                    labelStyle={{ color: '#f1f5f9' }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="Installed Capacity DBIS"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                    name="DBIS"
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="Installed Capacity Essequibo"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={false}
                    name="Essequibo"
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Generation Mix Chart */}
          <div className="bg-[#1a2744]/80 rounded-xl p-4 border border-[#2d3a52]">
            <h4 className="text-white font-medium text-lg mb-4">Generation Mix (HFO vs LFO)</h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    dataKey="monthLabel"
                    stroke="#94a3b8"
                    tick={{ fontSize: 10 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '8px'
                    }}
                    labelStyle={{ color: '#f1f5f9' }}
                    formatter={(value: any) => value ? `${value.toFixed(1)}%` : 'N/A'}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="HFO Generation Mix %"
                    stackId="1"
                    stroke="#ef4444"
                    fill="#ef4444"
                    fillOpacity={0.6}
                    name="HFO %"
                    connectNulls
                  />
                  <Area
                    type="monotone"
                    dataKey="LFO Generation Mix %"
                    stackId="1"
                    stroke="#22c55e"
                    fill="#22c55e"
                    fillOpacity={0.6}
                    name="LFO %"
                    connectNulls
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Affected Customers Chart */}
          <div className="bg-[#1a2744]/80 rounded-xl p-4 border border-[#2d3a52]">
            <h4 className="text-white font-medium text-lg mb-4">Affected Customers</h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    dataKey="monthLabel"
                    stroke="#94a3b8"
                    tick={{ fontSize: 10 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '8px'
                    }}
                    labelStyle={{ color: '#f1f5f9' }}
                    formatter={(value: any) => value ? value.toLocaleString() : 'N/A'}
                  />
                  <Bar
                    dataKey="Affected Customers"
                    fill="#f59e0b"
                    fillOpacity={0.8}
                    radius={[4, 4, 0, 0]}
                  />
                  <Line
                    type="monotone"
                    dataKey="Affected Customers"
                    stroke="#f97316"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Collection Rate Chart */}
          <div className="bg-[#1a2744]/80 rounded-xl p-4 border border-[#2d3a52] lg:col-span-2">
            <h4 className="text-white font-medium text-lg mb-4">Collection Rate Performance</h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    dataKey="monthLabel"
                    stroke="#94a3b8"
                    tick={{ fontSize: 10 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} domain={[0, 120]} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '8px'
                    }}
                    labelStyle={{ color: '#f1f5f9' }}
                    formatter={(value: any) => value ? `${value.toFixed(1)}%` : 'N/A'}
                  />
                  <ReferenceLine
                    y={95}
                    stroke="#ef4444"
                    strokeDasharray="5 5"
                    label={{ value: '95% Target', fill: '#ef4444', fontSize: 10 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="Collection Rate %"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#10b981' }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        </CollapsibleSection>
      )}

      {/* AI Analysis — Structured Insight Cards */}
      {analysis && analysis.sections && analysis.sections.length > 0 && (
        <div className="space-y-3">
          {/* Section header */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h4 className="text-[15px] font-semibold text-white">AI Trend Analysis</h4>
              <p className="text-[#64748b] text-xs">
                {analysis.date_range_start?.slice(0, 7)} to {analysis.date_range_end?.slice(0, 7)} &middot; {analysis.months_analyzed} months
              </p>
            </div>
          </div>

          {/* Insight cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {analysis.sections.map((section: any, i: number) => (
              <InsightCard key={i} section={section} />
            ))}
          </div>

          {/* Action items */}
          {analysis.action_items && analysis.action_items.length > 0 && (
            <ActionItemsCard items={analysis.action_items} />
          )}
        </div>
      )}

      {/* No Analysis Message */}
      {!analysis && chartData.length > 0 && (
        <div className="bg-[#1a2744]/50 rounded-xl p-6 border border-[#2d3a52] text-center">
          <Sparkles className="w-8 h-8 text-[#64748b] mx-auto mb-3" />
          <p className="text-[#94a3b8]">AI analysis will appear here after uploading new data</p>
        </div>
      )}
    </div>
  );
}
