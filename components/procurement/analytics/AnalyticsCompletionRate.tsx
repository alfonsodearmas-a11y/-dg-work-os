'use client';

import { useMemo } from 'react';
import { AGENCY_HEX_COLORS } from '@/lib/constants/agencies';
import type { ProcurementPackage } from '@/lib/procurement-types';

interface Props {
  packages: ProcurementPackage[];
}

export function AnalyticsCompletionRate({ packages }: Props) {
  const { completionRate, awardedCount, activeCount, byAgency } = useMemo(() => {
    const awarded = packages.filter((p) => p.current_stage === 'awarded');
    const active = packages.filter((p) => p.current_stage !== 'awarded');
    const total = packages.length || 1;
    const rate = Math.round((awarded.length / total) * 100);

    // Per-agency breakdown
    const agencyMap = new Map<string, { awarded: number; total: number }>();
    for (const pkg of packages) {
      const code = pkg.agency.toUpperCase();
      const entry = agencyMap.get(code) || { awarded: 0, total: 0 };
      entry.total++;
      if (pkg.current_stage === 'awarded') entry.awarded++;
      agencyMap.set(code, entry);
    }

    const agencyList = Array.from(agencyMap.entries())
      .map(([code, v]) => ({
        code,
        awarded: v.awarded,
        total: v.total,
        pct: Math.round((v.awarded / v.total) * 100),
        color: AGENCY_HEX_COLORS[code] || '#94a3b8',
      }))
      .sort((a, b) => b.pct - a.pct);

    return {
      completionRate: rate,
      awardedCount: awarded.length,
      activeCount: active.length,
      byAgency: agencyList,
    };
  }, [packages]);

  // Radial progress ring
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (completionRate / 100) * circumference;

  if (packages.length === 0) {
    return (
      <div className="card-premium p-5 h-full flex flex-col">
        <h3 className="text-sm font-semibold text-white mb-4">Completion Rate</h3>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-navy-600 text-sm">No data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card-premium p-5 h-full flex flex-col">
      <h3 className="text-sm font-semibold text-white mb-4">Completion Rate</h3>

      <div className="flex items-center gap-6 flex-1">
        {/* Radial ring */}
        <div className="relative w-32 h-32 shrink-0">
          <svg width="128" height="128" viewBox="0 0 128 128" className="transform -rotate-90">
            {/* Background track */}
            <circle
              cx="64" cy="64" r={radius}
              fill="none"
              stroke="#1e293b"
              strokeWidth="10"
            />
            {/* Progress arc */}
            <circle
              cx="64" cy="64" r={radius}
              fill="none"
              stroke={completionRate >= 50 ? '#10b981' : completionRate >= 25 ? '#d4af37' : '#64748b'}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className="transition-all duration-700 ease-out"
            />
          </svg>
          {/* Center text */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-2xl font-bold text-white leading-none">{completionRate}%</p>
              <p className="text-[9px] text-navy-600 mt-0.5">awarded</p>
            </div>
          </div>
        </div>

        {/* Stats + agency breakdown */}
        <div className="flex-1 min-w-0 space-y-4">
          <div className="flex gap-4">
            <div>
              <p className="text-lg font-bold text-emerald-400 leading-none">{awardedCount}</p>
              <p className="text-[10px] text-navy-600 mt-0.5">Awarded</p>
            </div>
            <div>
              <p className="text-lg font-bold text-slate-300 leading-none">{activeCount}</p>
              <p className="text-[10px] text-navy-600 mt-0.5">In Progress</p>
            </div>
          </div>

          {/* Per-agency */}
          {byAgency.length > 0 && (
            <div className="space-y-1.5">
              {byAgency.map((a) => (
                <div key={a.code} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
                  <span className="text-[11px] text-navy-600 w-10">{a.code}</span>
                  <div className="flex-1 h-1.5 bg-navy-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${a.pct}%`, backgroundColor: a.color }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 tabular-nums w-7 text-right">{a.pct}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
