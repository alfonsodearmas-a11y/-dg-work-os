'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { AlertCircle } from 'lucide-react';
import { ProgressBar, TrendIndicator } from '@/components/intel/common';
import type { GWIData } from '@/data/mockData';

interface MetricCardProps {
  title: string;
  value?: string | number;
  unit?: string;
  subtitle?: string;
  status?: 'good' | 'warning' | 'critical';
  children?: React.ReactNode;
}

function MetricCard({ title, value, unit, subtitle, status, children }: MetricCardProps) {
  return (
    <div className="bg-[#1a2744] rounded-xl p-5 border border-[#2d3a52]">
      <h4 className="text-[#94a3b8] text-sm mb-2">{title}</h4>
      {value !== undefined && (
        <div className="flex items-end gap-2 mb-1">
          <span className={`text-3xl font-bold ${
            status === 'good' ? 'text-emerald-400' :
            status === 'warning' ? 'text-amber-400' :
            status === 'critical' ? 'text-red-400' : 'text-[#d4af37]'
          }`}>
            {value}
          </span>
          {unit && <span className="text-[#94a3b8] text-lg mb-1">{unit}</span>}
        </div>
      )}
      {subtitle && <p className="text-[#64748b] text-sm">{subtitle}</p>}
      {children}
    </div>
  );
}

export interface GWIDetailProps {
  data: GWIData;
}

export function GWIDetail({ data }: GWIDetailProps) {
  if (!data) return null;

  const nrwStatus: 'good' | 'warning' | 'critical' =
    data.nrwPercent > 55 ? 'critical' : data.nrwPercent > 45 ? 'warning' : 'good';

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          title="Non-Revenue Water (NRW)"
          value={data.nrwPercent?.toFixed(1)}
          unit="%"
          status={nrwStatus}
          subtitle={`Target: ${data.nrwTarget}%`}
        >
          <div className="mt-3">
            <ProgressBar
              value={data.nrwPercent}
              max={100}
              target={data.nrwTarget}
              showValue={false}
              size="md"
              colorMode={nrwStatus === 'good' ? 'success' : nrwStatus === 'warning' ? 'warning' : 'danger'}
            />
            <p className={`text-xs mt-2 ${nrwStatus === 'good' ? 'text-emerald-400' : 'text-red-400'}`}>
              {data.nrwPercent > data.nrwTarget
                ? `${(data.nrwPercent - data.nrwTarget).toFixed(1)}% above target`
                : 'Within target'}
            </p>
          </div>
        </MetricCard>

        <MetricCard
          title="Active Disruptions"
          value={data.activeDisruptions}
          status={data.activeDisruptions > 3 ? 'warning' : 'good'}
        >
          <div className="mt-3 space-y-2">
            {data.disruptionAreas?.slice(0, 3).map((area, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <AlertCircle className="text-amber-400 flex-shrink-0" size={14} />
                <span className="text-white truncate">{area}</span>
              </div>
            ))}
          </div>
        </MetricCard>

        <MetricCard title="Response Metrics">
          <div className="space-y-4 mt-2">
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-[#94a3b8] text-sm">Avg Response</span>
                <TrendIndicator value={data.responseTimeTrend} inverse suffix=" hrs" />
              </div>
              <span className="text-2xl font-bold text-white">{data.avgResponseTime} hrs</span>
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-[#94a3b8] text-sm">Avg Repair</span>
                <TrendIndicator value={data.repairTimeTrend} inverse suffix=" hrs" />
              </div>
              <span className="text-2xl font-bold text-white">{data.avgRepairTime} hrs</span>
            </div>
          </div>
        </MetricCard>
      </div>

      {/* Production vs Billed */}
      <div className="bg-[#1a2744] rounded-xl p-5 border border-[#2d3a52]">
        <h4 className="text-[#94a3b8] text-sm mb-4">Water Production vs Billed</h4>
        <div className="flex items-end gap-8 mb-4">
          <div>
            <span className="text-3xl font-bold text-cyan-400">
              {(data.productionVsBilled?.produced / 1000).toFixed(0)}k
            </span>
            <p className="text-[#94a3b8] text-sm">m3 Produced</p>
          </div>
          <div>
            <span className="text-3xl font-bold text-emerald-400">
              {(data.productionVsBilled?.billed / 1000).toFixed(0)}k
            </span>
            <p className="text-[#94a3b8] text-sm">m3 Billed</p>
          </div>
        </div>
        <div className="relative h-8 bg-[#2d3a52] rounded-lg overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-500 to-cyan-600"
            style={{ width: '100%' }}
          />
          <div
            className="absolute inset-y-0 right-0 bg-red-500/60"
            style={{ width: `${(1 - data.productionVsBilled?.billed / data.productionVsBilled?.produced) * 100}%` }}
          />
          <div className="absolute inset-0 flex items-center justify-center text-white font-semibold text-sm">
            {((data.productionVsBilled?.billed / data.productionVsBilled?.produced) * 100).toFixed(1)}% Revenue Recovery
          </div>
        </div>
      </div>

      {/* 7-Day Disruption Trend */}
      <div className="bg-[#1a2744] rounded-xl p-5 border border-[#2d3a52]">
        <h4 className="text-[#94a3b8] text-sm mb-4">7-Day Disruption Trend</h4>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.disruptionTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3a52" />
              <XAxis dataKey="day" stroke="#94a3b8" tick={{ fontSize: 12 }} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1a2744', border: '1px solid #2d3a52', borderRadius: '8px' }}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ fill: '#f59e0b', r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
