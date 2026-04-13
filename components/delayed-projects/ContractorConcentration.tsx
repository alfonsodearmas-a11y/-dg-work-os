'use client';

import { useMemo } from 'react';
import { AGENCY_HEX_COLORS } from '@/lib/constants/agencies';
import { fmtCurrency } from '@/components/oversight/types';
import type { DelayedProjectWithComputed } from '@/lib/delayed-projects/types';
import { DaysValue, ExposureBar } from './shared';

interface ContractorConcentrationProps {
  projects: DelayedProjectWithComputed[];
  isMobile: boolean;
}

interface ContractorGroup {
  contractor: string;
  projectCount: number;
  agencies: string[];
  avgDaysOverdue: number;
  totalExposure: number; // remaining value in cents
}

export function ContractorConcentration({ projects, isMobile }: ContractorConcentrationProps) {
  const groups = useMemo(() => {
    const map = new Map<string, {
      count: number;
      agencies: Set<string>;
      overdueSum: number;
      overdueCount: number;
      exposure: number;
    }>();

    for (const p of projects) {
      const key = p.contractors?.trim() || 'Unknown Contractor';
      const entry = map.get(key) || { count: 0, agencies: new Set(), overdueSum: 0, overdueCount: 0, exposure: 0 };
      entry.count++;
      entry.agencies.add(p.sub_agency);
      if (p.days_overdue !== null && p.days_overdue > 0) {
        entry.overdueSum += p.days_overdue;
        entry.overdueCount++;
      }
      entry.exposure += p.remaining_value;
      map.set(key, entry);
    }

    const result: ContractorGroup[] = [];
    for (const [contractor, data] of map) {
      result.push({
        contractor,
        projectCount: data.count,
        agencies: Array.from(data.agencies).sort(),
        avgDaysOverdue: data.overdueCount > 0 ? Math.round(data.overdueSum / data.overdueCount) : 0,
        totalExposure: data.exposure,
      });
    }

    result.sort((a, b) => b.totalExposure - a.totalExposure);
    return result;
  }, [projects]);

  const maxExposure = useMemo(() => {
    let max = 1;
    for (const g of groups) {
      if (g.totalExposure > max) max = g.totalExposure;
    }
    return max;
  }, [groups]);

  if (groups.length === 0) return null;

  const contractorNameClass = (name: string) =>
    name === 'Unknown Contractor' ? 'text-slate-500 italic' : 'text-white';

  if (isMobile) {
    return (
      <div className="card-premium p-4 space-y-3">
        <h3 className="text-sm font-semibold text-white">Contractor Concentration</h3>
        <div className="space-y-2">
          {groups.map((g) => (
            <div key={g.contractor} className="p-3 bg-navy-950/40 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className={`text-xs font-medium ${contractorNameClass(g.contractor)}`}>
                  {g.contractor}
                </span>
                <span className="text-[10px] text-slate-400 bg-navy-800 px-1.5 py-0.5 rounded tabular-nums">
                  {g.projectCount} proj
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5">
                  {g.agencies.map(a => (
                    <span
                      key={a}
                      className="w-3 h-3 rounded-full border border-navy-900"
                      style={{ backgroundColor: AGENCY_HEX_COLORS[a] || '#64748b' }}
                      title={a}
                    />
                  ))}
                </div>
                <DaysValue days={g.avgDaysOverdue} />
              </div>
              <div className="flex items-center gap-2">
                <ExposureBar pct={(g.totalExposure / maxExposure) * 100} />
                <span className="text-xs text-white tabular-nums shrink-0">
                  {fmtCurrency(g.totalExposure / 100)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card-premium p-5 space-y-4">
      <h3 className="text-sm font-semibold text-white">Contractor Concentration</h3>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-navy-800">
              <th className="text-left text-gold-500 font-semibold pb-2 pr-3">Contractor</th>
              <th className="text-center text-gold-500 font-semibold pb-2 px-2 w-12">Proj</th>
              <th className="text-left text-gold-500 font-semibold pb-2 px-2">Agencies</th>
              <th className="text-right text-gold-500 font-semibold pb-2 px-2 w-20">Avg Overdue</th>
              <th className="text-right text-gold-500 font-semibold pb-2 pl-2 w-48">Remaining Exposure</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.contractor} className="border-b border-navy-800/40 hover:bg-navy-900/30 transition-colors">
                <td className="py-2 pr-3">
                  <span className={`font-medium ${contractorNameClass(g.contractor)}`}>
                    {g.contractor}
                  </span>
                </td>
                <td className="text-center text-white tabular-nums py-2 px-2">
                  <span className="bg-navy-800 px-1.5 py-0.5 rounded text-[10px]">
                    {g.projectCount}
                  </span>
                </td>
                <td className="py-2 px-2">
                  <div className="flex items-center gap-1">
                    {g.agencies.map(a => (
                      <span
                        key={a}
                        className="w-3.5 h-3.5 rounded-full border border-navy-900 shrink-0"
                        style={{ backgroundColor: AGENCY_HEX_COLORS[a] || '#64748b' }}
                        title={a}
                      />
                    ))}
                  </div>
                </td>
                <td className="text-right py-2 px-2">
                  <DaysValue days={g.avgDaysOverdue} />
                </td>
                <td className="py-2 pl-2">
                  <div className="flex items-center gap-2">
                    <ExposureBar pct={(g.totalExposure / maxExposure) * 100} />
                    <span className="text-white tabular-nums shrink-0 w-14 text-right">
                      {fmtCurrency(g.totalExposure / 100)}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
