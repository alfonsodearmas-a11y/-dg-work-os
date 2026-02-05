'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Shield, FileCheck, AlertTriangle, Clock } from 'lucide-react';
import { ProgressBar } from './common';
import type { GCAAData } from '@/data/mockData';

// Extend the base GCAAData with fields used by this detail component
// that may come from the API but aren't in the base mock type
interface GCAADetailData extends GCAAData {
  incidentReports?: number;
  renewalsPending?: number;
  inspectionTrend?: { week: string; completed: number }[];
}

export interface GCAADetailProps {
  data: GCAADetailData;
}

interface MetricCardProps {
  title: string;
  value: number | string;
  unit?: string;
  subtitle?: string;
  status?: 'good' | 'warning' | 'critical';
  icon?: React.ComponentType<{ className?: string; size?: number }>;
  children?: React.ReactNode;
}

function MetricCard({ title, value, unit, subtitle, status, icon: Icon, children }: MetricCardProps) {
  return (
    <div className="bg-[#1a2744] rounded-xl p-5 border border-[#2d3a52]">
      <div className="flex items-start justify-between mb-2">
        <h4 className="text-[#94a3b8] text-sm">{title}</h4>
        {Icon && <Icon className="text-[#64748b]" size={18} />}
      </div>
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
      {subtitle && <p className="text-[#64748b] text-sm">{subtitle}</p>}
      {children}
    </div>
  );
}

export function GCAADetail({ data }: GCAADetailProps) {
  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard
          title="Aircraft Registered"
          value={data.activeRegistrations}
          icon={Shield}
        />

        <MetricCard
          title="Inspections MTD"
          value={data.inspectionsMTD}
          subtitle={`of ${data.inspectionsTarget} target`}
          icon={FileCheck}
        >
          <div className="mt-2">
            <ProgressBar
              value={data.inspectionsMTD}
              max={data.inspectionsTarget}
              showValue={false}
              size="sm"
              colorMode="success"
            />
          </div>
        </MetricCard>

        <MetricCard
          title="Incident Reports"
          value={data.incidentReports ?? 0}
          status={(data.incidentReports ?? 0) === 0 ? 'good' : 'warning'}
          subtitle="This month"
          icon={AlertTriangle}
        />

        <MetricCard
          title="Renewals Pending"
          value={data.renewalsPending ?? 0}
          status={(data.renewalsPending ?? 0) > 10 ? 'warning' : 'good'}
          subtitle="Licenses"
          icon={Clock}
        />
      </div>

      {/* Compliance & Inspections */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-[#1a2744] rounded-xl p-5 border border-[#2d3a52]">
          <h4 className="text-[#94a3b8] text-sm mb-4">Compliance Audit Rate</h4>
          <div className="flex flex-col items-center">
            <div className="relative w-32 h-32">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke="#2d3a52"
                  strokeWidth="12"
                  fill="none"
                />
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke={data.complianceRate >= 90 ? '#10b981' : '#f59e0b'}
                  strokeWidth="12"
                  fill="none"
                  strokeDasharray={`${(data.complianceRate / 100) * 352} 352`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-2xl font-bold ${data.complianceRate >= 90 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {data.complianceRate?.toFixed(1)}%
                </span>
              </div>
            </div>
            <p className="text-[#64748b] text-sm mt-3">Target: 95%</p>
          </div>
        </div>

        <div className="bg-[#1a2744] rounded-xl p-5 border border-[#2d3a52]">
          <h4 className="text-[#94a3b8] text-sm mb-4">Weekly Inspections</h4>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.inspectionTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2d3a52" />
                <XAxis dataKey="week" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1a2744', border: '1px solid #2d3a52', borderRadius: '8px' }}
                  formatter={(value: number) => [value, 'Completed']}
                />
                <Bar dataKey="completed" fill="#0d9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
