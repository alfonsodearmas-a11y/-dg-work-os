'use client';

import { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  ReferenceLine
} from 'recharts';

const API_BASE = '/api';

interface MetricCardProps {
  title: string;
  value: string;
  subtitle: string;
  trend: 'danger' | 'warning' | 'success' | 'normal';
  icon: 'chart' | 'alert' | 'lightning' | 'shield';
}

function MetricCard({ title, value, subtitle, trend, icon }: MetricCardProps) {
  const trendColors: Record<string, string> = {
    danger: 'border-red-200 bg-red-50',
    warning: 'border-yellow-200 bg-yellow-50',
    success: 'border-green-200 bg-green-50',
    normal: 'border-[#2d3a52] bg-[#1a2744]'
  };

  const iconMap: Record<string, React.JSX.Element> = {
    chart: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    ),
    alert: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    ),
    lightning: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    ),
    shield: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    )
  };

  return (
    <div className={`rounded-lg border p-4 ${trendColors[trend]}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[#94a3b8]">{title}</p>
        <svg className="w-5 h-5 text-[#94a3b8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          {iconMap[icon]}
        </svg>
      </div>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
      {subtitle && <p className="mt-1 text-sm text-[#64748b]">{subtitle}</p>}
    </div>
  );
}

export function GPLForecastDashboard() {
  const [forecastData, setForecastData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>('briefing');

  useEffect(() => {
    fetchForecastData();
  }, []);

  async function fetchForecastData() {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/gpl/forecast/all`);
      const result = await response.json();

      if (result.success) {
        setForecastData(result.data);
      } else {
        setError(result.error || 'Failed to load forecast data');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh(includeAI = true) {
    try {
      setRefreshing(true);
      setError(null);

      const response = await fetch(`${API_BASE}/gpl/forecast/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ includeAI })
      });

      const result = await response.json();

      if (result.success) {
        await fetchForecastData();
      } else {
        setError(result.error || 'Failed to refresh forecasts');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-[#94a3b8]">Loading forecast data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
        <p className="text-red-400">{error}</p>
        <button
          onClick={() => fetchForecastData()}
          className="mt-2 text-sm text-red-400 hover:text-red-300 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  const hasData = forecastData && (
    forecastData.demand?.length > 0 ||
    forecastData.capacity?.length > 0 ||
    forecastData.briefing
  );

  if (!hasData) {
    return (
      <div className="bg-[#1a2744] border border-[#2d3a52] rounded-lg p-8 text-center">
        <div className="text-[#94a3b8] mb-4">
          <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-white mb-2">No Forecast Data Available</h3>
        <p className="text-[#94a3b8] mb-4">
          Upload daily DBIS Excel files and monthly KPI CSV data to generate forecasts.
        </p>
        <button
          onClick={() => handleRefresh(true)}
          disabled={refreshing}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          {refreshing ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Generating...
            </>
          ) : (
            <>Generate Forecasts</>
          )}
        </button>
      </div>
    );
  }

  // Process data for charts
  const dbisForecasts = forecastData.demand?.filter((d: any) => d.grid === 'DBIS') || [];
  const esqForecasts = forecastData.demand?.filter((d: any) => d.grid === 'Essequibo') || [];
  const dbisCapacity = forecastData.capacity?.find((c: any) => c.grid === 'DBIS');
  const esqCapacity = forecastData.capacity?.find((c: any) => c.grid === 'Essequibo');

  // Format demand chart data
  const demandChartData = dbisForecasts.map((d: any) => ({
    month: new Date(d.projected_month).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    projected: parseFloat(d.projected_peak_mw),
    low: parseFloat(d.confidence_low_mw),
    high: parseFloat(d.confidence_high_mw),
    capacity: dbisCapacity ? parseFloat(dbisCapacity.current_capacity_mw) : null
  }));

  // Essequibo chart data
  const esqChartData = esqForecasts.map((d: any) => ({
    month: new Date(d.projected_month).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    projected: parseFloat(d.projected_peak_mw),
    low: parseFloat(d.confidence_low_mw),
    high: parseFloat(d.confidence_high_mw),
    capacity: esqCapacity ? parseFloat(esqCapacity.current_capacity_mw) : null
  }));

  // Sort stations by risk
  const sortedStations = [...(forecastData.stations || [])].sort((a: any, b: any) => {
    const riskOrder: Record<string, number> = { critical: 0, warning: 1, good: 2 };
    return (riskOrder[a.risk_level] || 3) - (riskOrder[b.risk_level] || 3);
  });

  return (
    <div className="space-y-6">
      {/* Header with Refresh Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Predictive Analytics & Forecasting</h2>
          {forecastData.briefing?.dataThroughDate && (
            <p className="text-sm text-[#64748b]">
              Data through: {new Date(forecastData.briefing.dataThroughDate).toLocaleDateString()}
              {forecastData.briefing.dailyDataPoints && ` (${forecastData.briefing.dailyDataPoints} daily records)`}
            </p>
          )}
        </div>
        <button
          onClick={() => handleRefresh(true)}
          disabled={refreshing}
          className="inline-flex items-center px-4 py-2 border border-[#2d3a52] rounded-md shadow-sm text-sm font-medium text-white bg-[#1a2744] hover:bg-[#2d3a52] disabled:opacity-50"
        >
          {refreshing ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#94a3b8] mr-2"></div>
              Refreshing...
            </>
          ) : (
            <>
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh Forecasts
            </>
          )}
        </button>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Projected Peak (6mo)"
          value={dbisForecasts[5] ? `${parseFloat(dbisForecasts[5].projected_peak_mw).toFixed(1)} MW` : 'N/A'}
          subtitle={dbisForecasts[5] ? `Range: ${parseFloat(dbisForecasts[5].confidence_low_mw).toFixed(0)}-${parseFloat(dbisForecasts[5].confidence_high_mw).toFixed(0)} MW` : ''}
          trend={dbisCapacity?.reserve_margin_pct < 15 ? 'warning' : 'normal'}
          icon="chart"
        />
        <MetricCard
          title="Capacity Shortfall"
          value={dbisCapacity?.shortfall_date ? new Date(dbisCapacity.shortfall_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Not Projected'}
          subtitle={dbisCapacity?.months_until_shortfall ? `In ${dbisCapacity.months_until_shortfall} months` : 'Reserve adequate'}
          trend={dbisCapacity?.risk_level === 'critical' ? 'danger' : dbisCapacity?.risk_level === 'warning' ? 'warning' : 'success'}
          icon="alert"
        />
        <MetricCard
          title="Avg Load Shedding"
          value={forecastData.loadShedding ? `${parseFloat(forecastData.loadShedding.avg_shed_mw).toFixed(1)} MW` : 'N/A'}
          subtitle={forecastData.loadShedding ? `Trend: ${forecastData.loadShedding.trend}` : ''}
          trend={forecastData.loadShedding?.trend === 'increasing' ? 'danger' : forecastData.loadShedding?.trend === 'decreasing' ? 'success' : 'normal'}
          icon="lightning"
        />
        <MetricCard
          title="Reserve Margin"
          value={dbisCapacity ? `${parseFloat(dbisCapacity.reserve_margin_pct).toFixed(1)}%` : 'N/A'}
          subtitle={dbisCapacity ? `${parseFloat(dbisCapacity.current_capacity_mw).toFixed(0)} MW capacity` : ''}
          trend={dbisCapacity?.reserve_margin_pct < 10 ? 'danger' : dbisCapacity?.reserve_margin_pct < 15 ? 'warning' : 'success'}
          icon="shield"
        />
      </div>

      {/* AI Strategic Briefing */}
      {forecastData.briefing && (
        <div className="bg-gradient-to-r from-[#1a2744] to-[#0a1628] rounded-lg shadow-lg overflow-hidden">
          <button
            onClick={() => setExpandedSection(expandedSection === 'briefing' ? null : 'briefing')}
            className="w-full px-6 py-4 flex items-center justify-between text-left"
          >
            <div className="flex items-center">
              <div className="bg-blue-500 rounded-lg p-2 mr-4">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">AI Strategic Briefing</h3>
                <p className="text-sm text-[#94a3b8]">
                  Generated {new Date(forecastData.briefing.generatedAt).toLocaleString()}
                </p>
              </div>
            </div>
            <svg
              className={`w-5 h-5 text-[#94a3b8] transition-transform ${expandedSection === 'briefing' ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {expandedSection === 'briefing' && (
            <div className="px-6 pb-6">
              <div className="bg-[#2d3a52]/50 rounded-lg p-4 prose prose-invert prose-sm max-w-none">
                <div className="whitespace-pre-wrap text-white leading-relaxed">
                  {forecastData.briefing.executiveBriefing}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Demand vs Capacity Chart - DBIS */}
      {demandChartData.length > 0 && (
        <div className="bg-[#1a2744] rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-white mb-4">DBIS Grid: Demand vs Capacity Forecast</h3>
          <ResponsiveContainer width="100%" height={350}>
            <ComposedChart data={demandChartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3a52" />
              <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} label={{ value: 'MW', angle: -90, position: 'insideLeft', fill: '#94a3b8' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  border: 'none',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
                  color: '#f1f5f9'
                }}
                labelStyle={{ color: '#94a3b8', fontWeight: 600 }}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="high"
                fill="#1e3a5f"
                stroke="none"
                name="Upper Bound"
              />
              <Area
                type="monotone"
                dataKey="low"
                fill="#0a1628"
                stroke="none"
                name="Lower Bound"
              />
              <Line
                type="monotone"
                dataKey="projected"
                stroke="#2563eb"
                strokeWidth={3}
                dot={{ fill: '#2563eb', strokeWidth: 2 }}
                name="Projected Peak"
              />
              {demandChartData[0]?.capacity && (
                <ReferenceLine
                  y={demandChartData[0].capacity}
                  stroke="#dc2626"
                  strokeDasharray="5 5"
                  strokeWidth={2}
                  label={{ value: 'Capacity', fill: '#dc2626', position: 'right' }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Essequibo Grid Outlook */}
      {esqChartData.length > 0 && (
        <div className="bg-[#1a2744] rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Essequibo Grid Outlook</h3>
            {esqCapacity && (
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                esqCapacity.risk_level === 'critical' ? 'bg-red-500/20 text-red-400' :
                esqCapacity.risk_level === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-green-500/20 text-green-400'
              }`}>
                {esqCapacity.risk_level?.toUpperCase() || 'UNKNOWN'} RISK
              </span>
            )}
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={esqChartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3a52" />
              <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} label={{ value: 'MW', angle: -90, position: 'insideLeft', fill: '#94a3b8' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  border: 'none',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
                  color: '#f1f5f9'
                }}
              />
              <Area
                type="monotone"
                dataKey="projected"
                fill="#a78bfa"
                stroke="#7c3aed"
                strokeWidth={2}
                name="Projected Peak"
              />
              {esqChartData[0]?.capacity && (
                <ReferenceLine
                  y={esqChartData[0].capacity}
                  stroke="#dc2626"
                  strokeDasharray="5 5"
                  strokeWidth={2}
                  label={{ value: 'Capacity', fill: '#dc2626', position: 'right' }}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Station Reliability & Units at Risk */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Station Reliability */}
        {sortedStations.length > 0 && (
          <div className="bg-[#1a2744] rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-[#2d3a52]">
              <h3 className="text-lg font-semibold text-white">Station Reliability</h3>
              <p className="text-sm text-[#64748b]">90-day performance analysis</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[#2d3a52]">
                <thead className="bg-[#0a1628]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#64748b] uppercase">Station</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-[#64748b] uppercase">Uptime</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-[#64748b] uppercase">Utilization</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-[#64748b] uppercase">Units</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-[#64748b] uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-[#1a2744] divide-y divide-[#2d3a52]">
                  {sortedStations.slice(0, 10).map((station: any, idx: number) => (
                    <tr key={idx} className="hover:bg-[#2d3a52]/50">
                      <td className="px-4 py-3 text-sm font-medium text-white">{station.station}</td>
                      <td className="px-4 py-3 text-sm text-right text-[#94a3b8]">{(parseFloat(station.uptime_pct) || 0).toFixed(1)}%</td>
                      <td className="px-4 py-3 text-sm text-right text-[#94a3b8]">{(parseFloat(station.avg_utilization_pct) || 0).toFixed(1)}%</td>
                      <td className="px-4 py-3 text-sm text-right text-[#94a3b8]">{station.online_units}/{station.total_units}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          station.risk_level === 'critical' ? 'bg-red-500/20 text-red-400' :
                          station.risk_level === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-green-500/20 text-green-400'
                        }`}>
                          {station.risk_level}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Units at Risk */}
        {forecastData.unitsAtRisk?.length > 0 && (
          <div className="bg-[#1a2744] rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-[#2d3a52]">
              <h3 className="text-lg font-semibold text-white">Units at Risk</h3>
              <p className="text-sm text-[#64748b]">High-risk units requiring attention</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[#2d3a52]">
                <thead className="bg-[#0a1628]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#64748b] uppercase">Unit</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-[#64748b] uppercase">Capacity</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-[#64748b] uppercase">Uptime</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-[#64748b] uppercase">Failures</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-[#64748b] uppercase">Risk</th>
                  </tr>
                </thead>
                <tbody className="bg-[#1a2744] divide-y divide-[#2d3a52]">
                  {forecastData.unitsAtRisk.slice(0, 10).map((unit: any, idx: number) => (
                    <tr key={idx} className="hover:bg-[#2d3a52]/50">
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-white">{unit.station}</div>
                        <div className="text-xs text-[#64748b]">{unit.unit_number}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-[#94a3b8]">{parseFloat(unit.derated_mw).toFixed(1)} MW</td>
                      <td className="px-4 py-3 text-sm text-right text-[#94a3b8]">{parseFloat(unit.uptime_pct_90d).toFixed(1)}%</td>
                      <td className="px-4 py-3 text-sm text-right text-[#94a3b8]">{unit.failure_count_90d}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          unit.risk_level === 'high' ? 'bg-red-500/20 text-red-400' :
                          unit.risk_level === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-green-500/20 text-green-400'
                        }`}>
                          {parseFloat(unit.risk_score).toFixed(0)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Load Shedding Analysis */}
      {forecastData.loadShedding && (
        <div className="bg-[#1a2744] rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Load Shedding Analysis</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-[#0a1628] rounded-lg p-4">
              <p className="text-sm text-[#64748b]">Period Analyzed</p>
              <p className="text-xl font-semibold text-white">{forecastData.loadShedding.period_days} days</p>
            </div>
            <div className="bg-[#0a1628] rounded-lg p-4">
              <p className="text-sm text-[#64748b]">Average Daily</p>
              <p className="text-xl font-semibold text-white">{parseFloat(forecastData.loadShedding.avg_shed_mw).toFixed(1)} MW</p>
            </div>
            <div className="bg-[#0a1628] rounded-lg p-4">
              <p className="text-sm text-[#64748b]">Maximum</p>
              <p className="text-xl font-semibold text-white">{parseFloat(forecastData.loadShedding.max_shed_mw).toFixed(1)} MW</p>
            </div>
            <div className="bg-[#0a1628] rounded-lg p-4">
              <p className="text-sm text-[#64748b]">Days with Shedding</p>
              <p className="text-xl font-semibold text-white">{forecastData.loadShedding.shed_days_count}</p>
            </div>
            <div className="bg-[#0a1628] rounded-lg p-4">
              <p className="text-sm text-[#64748b]">6-Month Projection</p>
              <p className="text-xl font-semibold text-white">{parseFloat(forecastData.loadShedding.projected_avg_6mo).toFixed(1)} MW</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
