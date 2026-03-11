'use client';

import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
  ReferenceLine, LabelList,
} from 'recharts';
import {
  Zap, Users, DollarSign, RefreshCw, Activity,
  TrendingUp, TrendingDown,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { GPLMonthlyKpi } from '../GPLMonthlyKpi';
import type { KpiState, KpiDataEntry } from './gpl-types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GPLKpiTabProps {
  kpiData: KpiState;
  kpiLoading: boolean;
}

// ---------------------------------------------------------------------------
// Sub-component: KpiSummaryCard
// ---------------------------------------------------------------------------

interface KpiSummaryCardProps {
  name: string;
  data: KpiDataEntry | undefined | null;
  icon: LucideIcon;
  unit: string;
  inverseGood?: boolean;
  target?: number;
}

function KpiSummaryCard({ name, data, icon: Icon, unit, inverseGood = false, target }: KpiSummaryCardProps) {
  if (!data) return null;

  const isUp = (data.changePct ?? 0) > 0;
  const isGood = inverseGood ? !isUp : isUp;
  const atTarget = target != null && data.value >= target;

  return (
    <div className="bg-navy-900 rounded-xl border border-navy-800 p-3 md:p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-navy-800 flex items-center justify-center">
            <Icon className="w-5 h-5 text-slate-400" />
          </div>
          <span className="text-slate-400 text-[15px]">{name}</span>
        </div>
        {data.changePct !== null && (
          <div className={`flex items-center gap-1 px-2 py-1 rounded ${isGood ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
            {isUp ? <TrendingUp className={`w-4 h-4 ${isGood ? 'text-emerald-400' : 'text-red-400'}`} /> : <TrendingDown className={`w-4 h-4 ${isGood ? 'text-emerald-400' : 'text-red-400'}`} />}
            <span className={`text-sm ${isGood ? 'text-emerald-400' : 'text-red-400'}`}>{Math.abs(data.changePct ?? 0).toFixed(1)}%</span>
          </div>
        )}
      </div>
      <p className={`text-2xl md:text-3xl font-bold ${target != null ? (atTarget ? 'text-emerald-400' : 'text-red-400') : 'text-slate-100'}`}>
        {typeof data.value === 'number' ? (unit === '%' ? data.value.toFixed(1) : Math.round(data.value).toLocaleString()) : data.value}{unit}
      </p>
      {data.previousValue !== null && (
        <p className="text-navy-600 text-sm mt-1">vs {Math.round(data.previousValue).toLocaleString()}{unit} last month</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GPLKpiTab({ kpiData, kpiLoading }: GPLKpiTabProps) {
  return (
    <div className="space-y-4">
      {/* Full GPLMonthlyKpi component (includes upload, cards, charts, AI analysis) */}
      <GPLMonthlyKpi />

      {kpiLoading ? (
        <div className="flex items-center justify-center py-12" role="status" aria-label="Loading">
          <RefreshCw className="w-6 h-6 text-navy-600 animate-spin" aria-hidden="true" />
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

          {/* Charts -- collapsible */}
          {kpiData.trends.length > 0 && (
            <CollapsibleSection
              title="Historical Charts"
              icon={Activity}
              badge={{ text: '2 charts', variant: 'info' }}
              defaultOpen={false}
            >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Peak Demand Trends */}
              <div className="bg-navy-900 rounded-xl border border-navy-800 p-3 md:p-4">
                <h4 className="text-slate-100 font-medium text-lg mb-4">Peak Demand Trends</h4>
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

              {/* Collection Rate - Bar Chart */}
              <div className="bg-navy-900 rounded-xl border border-navy-800 p-3 md:p-4">
                <h4 className="text-slate-100 font-medium text-lg mb-4">Collection Rate Performance</h4>
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
  );
}
