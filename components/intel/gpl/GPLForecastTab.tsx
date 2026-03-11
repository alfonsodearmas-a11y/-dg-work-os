'use client';

import {
  BarChart, Bar, Line, ComposedChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, ReferenceLine,
} from 'recharts';
import {
  Zap, RefreshCw, Activity, Info, Thermometer,
} from 'lucide-react';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { InsightCard } from '@/components/ui/InsightCard';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GPLForecastTabProps {
  enhancedForecast: any;
  enhancedLoading: boolean;
  enhancedRegenerating: boolean;
  enhancedCached: boolean;
  onRegenerateEnhanced: () => void;
}

// ---------------------------------------------------------------------------
// Sub-component: ForecastMetricCard
// ---------------------------------------------------------------------------

interface ForecastMetricCardProps {
  title: string;
  value: number | string;
  unit?: string;
  isDate?: boolean;
  trend?: 'danger' | 'warning' | 'success' | 'normal';
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
    const dateMatch = String(value).match(/^(\d{4})-(\d{2})$/);
    if (dateMatch) {
      const [, year, month] = dateMatch;
      const d = new Date(parseInt(year), parseInt(month) - 1);
      displayValue = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    } else {
      displayValue = String(value);
    }
  } else if (typeof value === 'string') {
    displayValue = value;
  } else if (typeof value === 'number' && !isNaN(value)) {
    displayValue = `${value.toFixed(1)}${unit}`;
  }

  return (
    <div className={`bg-navy-900 rounded-xl border border-navy-800 border-l-4 ${trendStyles[trend]} p-3 md:p-5`}>
      <p className="text-navy-600 text-[15px] mb-1">{title}</p>
      <p className="text-xl md:text-2xl font-bold text-slate-100">{displayValue}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GPLForecastTab({
  enhancedForecast,
  enhancedLoading,
  enhancedRegenerating,
  enhancedCached,
  onRegenerateEnhanced,
}: GPLForecastTabProps) {
  return (
    <div className="space-y-4">
      {/* Header with cache info + Regenerate */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-slate-100 font-medium text-xl md:text-[22px]">Predictive Analytics</h3>
          {enhancedForecast?.metadata?.generated_at && (
            <p className="text-navy-600 text-sm mt-0.5">
              Last generated: {new Date(enhancedForecast.metadata.generated_at).toLocaleString()}
              {enhancedCached && <span className="text-blue-400 ml-2">(cached)</span>}
            </p>
          )}
        </div>
        <button
          onClick={onRegenerateEnhanced}
          disabled={enhancedRegenerating}
          className="px-4 py-2 bg-navy-900 hover:bg-navy-800 text-slate-400 rounded-lg flex items-center gap-2 text-base border border-navy-800 disabled:opacity-50"
        >
          <RefreshCw size={16} className={enhancedRegenerating ? 'animate-spin' : ''} />
          {enhancedRegenerating ? 'Generating with Opus...' : 'Regenerate Forecast'}
        </button>
      </div>

      {enhancedLoading || enhancedRegenerating ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3" role="status" aria-label="Loading">
          <RefreshCw className="w-8 h-8 text-gold-500 animate-spin" aria-hidden="true" />
          <p className="text-slate-400 text-[15px]">
            {enhancedRegenerating ? 'Generating enhanced forecast with Claude Opus...' : 'Loading enhanced forecast...'}
          </p>
          {enhancedRegenerating && (
            <p className="text-navy-600 text-sm">This typically takes 15-30 seconds</p>
          )}
        </div>
      ) : enhancedForecast ? (
        <>
          {/* AI Briefing Headline */}
          {enhancedForecast.briefing?.headline && (
            <div className="bg-gradient-to-r from-[#1a2744] to-[#243049] rounded-xl border border-gold-500/30 p-3 md:p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-gold-500/20 flex items-center justify-center flex-shrink-0">
                  <Zap className="w-5 h-5 text-gold-500" />
                </div>
                <p className="text-slate-100 text-[15px] leading-relaxed font-medium">{enhancedForecast.briefing.headline}</p>
              </div>
            </div>
          )}

          {/* Forecast KPI Cards -- from most_likely scenario */}
          <ForecastKpiCards enhancedForecast={enhancedForecast} />

          {/* 3-Scenario Trajectory Chart */}
          <ScenarioChart enhancedForecast={enhancedForecast} />

          {/* Scenario Comparison Table */}
          <ScenarioComparisonTable enhancedForecast={enhancedForecast} />

          {/* Methodology & Analysis */}
          <MethodologySection enhancedForecast={enhancedForecast} />

          {/* AI Analysis Sections */}
          {enhancedForecast.briefing?.sections?.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-slate-100 font-medium text-lg">AI Analysis</h4>
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
        <div className="bg-navy-900 rounded-xl border border-navy-800 p-4 md:p-8 text-center">
          <Activity className="w-10 h-10 text-navy-600 mx-auto mb-3" />
          <h4 className="text-slate-100 font-medium text-lg mb-2">Forecast Unavailable</h4>
          <p className="text-navy-600 text-[15px] max-w-md mx-auto mb-4">
            The enhanced forecast requires historical KPI data and an API key to generate projections.
          </p>
          <button
            onClick={onRegenerateEnhanced}
            className="px-4 py-2 bg-gold-500 text-navy-950 rounded-lg font-medium hover:bg-[#c5a030] transition-colors"
          >
            Generate Forecast
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Forecast KPI Cards sub-section
// ---------------------------------------------------------------------------

function ForecastKpiCards({ enhancedForecast }: { enhancedForecast: any }) {
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
}

// ---------------------------------------------------------------------------
// 3-Scenario Trajectory Chart sub-section
// ---------------------------------------------------------------------------

function ScenarioChart({ enhancedForecast }: { enhancedForecast: any }) {
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
    <div className="bg-navy-900 rounded-xl border border-navy-800 p-3 md:p-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-2">
        <h4 className="text-slate-100 font-medium text-lg">Demand Forecast -- 3 Scenarios (24 months)</h4>
        <div className="flex items-center gap-4 text-xs text-navy-600">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-5 h-0.5 bg-gold-500" /> Most Likely
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
            {/* Planning envelope -- shaded up to aggressive */}
            <Area type="monotone" dataKey="aggressive" fill="#f59e0b" fillOpacity={0.06} stroke="none" />
            {/* Scenario lines */}
            <Line type="monotone" dataKey="conservative" stroke="#60a5fa" strokeWidth={2} strokeDasharray="6 4" dot={false} name="conservative" />
            <Line type="monotone" dataKey="most_likely" stroke="#d4af37" strokeWidth={3} dot={false} activeDot={{ r: 5, fill: '#d4af37' }} name="most_likely" />
            <Line type="monotone" dataKey="aggressive" stroke="#f87171" strokeWidth={2} strokeDasharray="6 4" dot={false} name="aggressive" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scenario Comparison Table sub-section
// ---------------------------------------------------------------------------

function ScenarioComparisonTable({ enhancedForecast }: { enhancedForecast: any }) {
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

  return (
    <CollapsibleSection
      title="Scenario Comparison"
      icon={Activity}
      defaultOpen={false}
      badge={{ text: '24 months' }}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label="Scenario comparison">
          <thead>
            <tr className="border-b border-navy-800 bg-navy-950">
              <th scope="col" className="text-left py-3 px-4 text-slate-400 font-medium">Timeframe</th>
              <th scope="col" className="text-right py-3 px-4 text-blue-400 font-medium">Conservative</th>
              <th scope="col" className="text-right py-3 px-4 text-gold-500 font-medium">Most Likely</th>
              <th scope="col" className="text-right py-3 px-4 text-red-400 font-medium">Aggressive</th>
              <th scope="col" className="text-right py-3 px-4 text-slate-400 font-medium">Capacity</th>
              <th scope="col" className="text-right py-3 px-4 text-slate-400 font-medium">Reserve (ML)</th>
              <th scope="col" className="text-center py-3 px-4 text-slate-400 font-medium">Seasonal</th>
            </tr>
          </thead>
          <tbody>
            {timeframes.map(tf => {
              const cRow = cons[tf.idx];
              const mRow = ml[tf.idx];
              const aRow = agg[tf.idx];
              if (!mRow) return null;

              return (
                <tr key={tf.label} className="border-b border-navy-800/50">
                  <td className="py-3 px-4 text-slate-100 font-medium">{tf.label}</td>
                  <td className="py-3 px-4 text-right text-blue-300">{cRow?.peak_mw?.toFixed(1) || '-'} MW</td>
                  <td className="py-3 px-4 text-right text-gold-500 font-semibold">{mRow.peak_mw.toFixed(1)} MW</td>
                  <td className="py-3 px-4 text-right text-red-300">{aRow?.peak_mw?.toFixed(1) || '-'} MW</td>
                  <td className="py-3 px-4 text-right text-navy-600">{mRow.capacity_mw?.toFixed(0) || '-'} MW</td>
                  <td className={`py-3 px-4 text-right font-medium rounded ${getReserveClass(mRow.reserve_pct)}`}>
                    {mRow.reserve_pct?.toFixed(1)}%
                  </td>
                  <td className="py-3 px-4 text-center">
                    {isHighSeason(mRow.month) ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/15 text-amber-400 rounded text-xs font-medium">
                        <Thermometer className="w-3 h-3" /> Peak
                      </span>
                    ) : (
                      <span className="text-navy-600 text-xs">&mdash;</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  );
}

// ---------------------------------------------------------------------------
// Methodology & Analysis sub-section
// ---------------------------------------------------------------------------

function MethodologySection({ enhancedForecast }: { enhancedForecast: any }) {
  return (
    <CollapsibleSection
      title="Methodology & Analysis"
      icon={Info}
      defaultOpen={false}
    >
      <div className="space-y-4">
        {/* Model Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-navy-950 rounded-lg p-3 border border-navy-800">
            <p className="text-navy-600 text-xs mb-1">Model Type</p>
            <p className="text-slate-100 text-sm font-medium">{enhancedForecast.methodology?.model_type || 'N/A'}</p>
          </div>
          <div className="bg-navy-950 rounded-lg p-3 border border-navy-800">
            <p className="text-navy-600 text-xs mb-1">R&sup2; Fit</p>
            <p className="text-slate-100 text-sm font-medium">{enhancedForecast.methodology?.r_squared?.toFixed(3) || 'N/A'}</p>
          </div>
          <div className="bg-navy-950 rounded-lg p-3 border border-navy-800">
            <p className="text-navy-600 text-xs mb-1">Confidence</p>
            <p className="text-slate-100 text-sm font-medium">{enhancedForecast.methodology?.confidence_level || 'N/A'}</p>
          </div>
          <div className="bg-navy-950 rounded-lg p-3 border border-navy-800">
            <p className="text-navy-600 text-xs mb-1">Data Points</p>
            <p className="text-slate-100 text-sm font-medium">{enhancedForecast.methodology?.data_points || 0} months</p>
          </div>
        </div>

        {/* Factor Weights */}
        {enhancedForecast.methodology?.factors_used?.length > 0 && (
          <div className="bg-navy-950 rounded-lg p-4 border border-navy-800">
            <p className="text-blue-400 text-sm font-medium mb-3">Factor Weights</p>
            <div className="flex flex-wrap gap-2">
              {enhancedForecast.methodology.factors_used.map((f: string, i: number) => (
                <span key={i} className="px-3 py-1.5 bg-navy-900 rounded-lg text-[#c8d0dc] text-sm border border-navy-800">{f}</span>
              ))}
            </div>
          </div>
        )}

        {/* Seasonal Factors Chart */}
        {Object.keys(enhancedForecast.seasonal_factors || {}).length > 0 && (
          <div className="bg-navy-950 rounded-lg p-4 border border-navy-800">
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
            <div className="flex items-center justify-center gap-4 mt-2 text-xs text-navy-600">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#f59e0b] inline-block" /> Above average (peak)</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#60a5fa] inline-block" /> Below average (trough)</span>
            </div>
          </div>
        )}

        {/* Demand Drivers */}
        {enhancedForecast.demand_drivers?.length > 0 && (
          <div className="bg-navy-950 rounded-lg p-4 border border-navy-800">
            <p className="text-blue-400 text-sm font-medium mb-3">Demand Drivers</p>
            <div className="space-y-3">
              {enhancedForecast.demand_drivers.map((d: any, i: number) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[#c8d0dc] text-sm">{d.factor}</span>
                    <span className="text-slate-100 text-sm font-semibold">{d.contribution_pct}%</span>
                  </div>
                  <div className="w-full h-2 bg-navy-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#d4af37] to-[#f59e0b]"
                      style={{ width: `${Math.min(d.contribution_pct, 100)}%` }}
                    />
                  </div>
                  <p className="text-navy-600 text-xs mt-0.5">{d.trend}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Metadata */}
        <div className="bg-navy-950 rounded-lg p-3 border border-navy-800">
          <p className="text-navy-600 text-xs">
            Generated by {enhancedForecast.metadata?.model || 'Claude Opus'} using {enhancedForecast.metadata?.data_points || 0} months of historical data
            ({enhancedForecast.metadata?.data_period || 'N/A'}).
            Processing time: {enhancedForecast.metadata?.processing_time_ms ? `${(enhancedForecast.metadata.processing_time_ms / 1000).toFixed(1)}s` : 'N/A'}.
          </p>
        </div>
      </div>
    </CollapsibleSection>
  );
}
