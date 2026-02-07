'use client';

import { CheckCircle, AlertTriangle } from 'lucide-react';
import type { AgencyData } from './AgencyCard';

interface StatusBarProps {
  agencies: AgencyData[];
}

export function StatusBar({ agencies }: StatusBarProps) {
  const criticalCount = agencies.filter(a => a.status?.type === 'critical').length;
  const warningCount = agencies.filter(a => a.status?.type === 'warning').length;
  const healthyCount = agencies.filter(a => a.status?.type === 'good').length;
  const hasIssues = criticalCount > 0 || warningCount > 0;

  return (
    <div
      className={`rounded-2xl p-5 sm:p-6 border transition-all ${
        criticalCount > 0
          ? 'bg-red-500/[0.08] border-red-500/30'
          : warningCount > 0
          ? 'bg-amber-500/[0.08] border-amber-500/30'
          : 'bg-emerald-500/[0.08] border-emerald-500/30'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {/* Status message */}
        <div className="flex items-center gap-4">
          <div
            className={`p-3 rounded-xl ${
              criticalCount > 0
                ? 'bg-red-500/[0.15]'
                : warningCount > 0
                ? 'bg-amber-500/[0.15]'
                : 'bg-emerald-500/[0.15]'
            }`}
          >
            {hasIssues ? (
              <AlertTriangle
                className={criticalCount > 0 ? 'text-red-400' : 'text-amber-400'}
                size={24}
              />
            ) : (
              <CheckCircle className="text-emerald-400" size={24} />
            )}
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-white">
              {criticalCount > 0
                ? 'Critical Issues Detected'
                : warningCount > 0
                ? 'Attention Required'
                : 'All Systems Operational'}
            </h2>
            <p className="text-[#94a3b8] text-sm">
              {healthyCount}/{agencies.length} agencies operating normally
              {criticalCount > 0 && ` \u2022 ${criticalCount} critical`}
              {warningCount > 0 && ` \u2022 ${warningCount} warning${warningCount > 1 ? 's' : ''}`}
            </p>
          </div>
        </div>

        {/* Status indicators */}
        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
          {agencies.map(agency => (
            <div
              key={agency.id}
              className="flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1.5 rounded-lg bg-[#1a2744]/80"
              title={`${agency.title}: ${agency.status?.text || 'Unknown'}`}
            >
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  agency.status?.type === 'good'
                    ? 'bg-emerald-500'
                    : agency.status?.type === 'warning'
                    ? 'bg-amber-500 animate-pulse'
                    : agency.status?.type === 'critical'
                    ? 'bg-red-500 animate-pulse'
                    : 'bg-[#64748b]'
                }`}
              />
              <span className="text-white text-sm font-medium">{agency.title}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
