'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, ReferenceLine, ComposedChart
} from 'recharts';
import {
  TrendingUp, TrendingDown, Minus, Users, Zap, DollarSign,
  Fuel, Upload, AlertTriangle, Sparkles, RefreshCw
} from 'lucide-react';
import { GPLKpiUpload } from './GPLKpiUpload';

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
          <h3 className="text-lg font-semibold text-white">GPL Monthly Performance</h3>
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
            <span className="text-[#94a3b8] text-xs">{name}</span>
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
          <h3 className="text-lg font-semibold text-white">GPL Monthly Performance</h3>
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

      {/* Charts */}
      {chartData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Peak Demand Chart */}
          <div className="bg-[#1a2744]/80 rounded-xl p-4 border border-[#2d3a52]">
            <h4 className="text-white font-medium mb-4">Peak Demand Trends</h4>
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
            <h4 className="text-white font-medium mb-4">Installed Capacity</h4>
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
            <h4 className="text-white font-medium mb-4">Generation Mix (HFO vs LFO)</h4>
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
            <h4 className="text-white font-medium mb-4">Affected Customers</h4>
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
            <h4 className="text-white font-medium mb-4">Collection Rate Performance</h4>
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
      )}

      {/* AI Analysis */}
      {analysis && analysis.executive_briefing && (
        <div className="bg-gradient-to-br from-purple-500/10 to-violet-500/10 border border-purple-500/30 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h4 className="text-white font-semibold">AI Trend Analysis</h4>
              <p className="text-[#64748b] text-xs">
                Analyzing {analysis.date_range_start} to {analysis.date_range_end}
              </p>
            </div>
          </div>
          <div className="text-white text-sm leading-relaxed whitespace-pre-wrap">
            {analysis.executive_briefing}
          </div>
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
