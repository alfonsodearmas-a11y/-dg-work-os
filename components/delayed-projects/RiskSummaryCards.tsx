'use client';

import { useMemo } from 'react';
import { DollarSign, TrendingUp, AlertTriangle, FileWarning } from 'lucide-react';
import { WarRoomKpiCard } from './shared';
import { fmtCurrency } from '@/components/oversight/types';
import type { DelayedProjectWithComputed } from '@/lib/delayed-projects/types';

interface RiskSummaryCardsProps {
  projects: DelayedProjectWithComputed[];
}

export function RiskSummaryCards({ projects }: RiskSummaryCardsProps) {
  const stats = useMemo(() => {
    if (projects.length === 0) {
      return { totalExposure: 0, avgCompletion: 0, criticalCount: 0, missingDataCount: 0 };
    }

    let totalExposure = 0;
    let totalCompletion = 0;
    let criticalCount = 0;
    let missingDataCount = 0;

    for (const p of projects) {
      totalExposure += p.remaining_value;
      totalCompletion += p.completion_percent;

      // Critical: >1 year overdue AND >$1B GYD remaining (1e11 cents)
      if ((p.days_overdue ?? 0) > 365 && p.remaining_value > 1e11) {
        criticalCount++;
      }

      // Missing data: no end date, zero value, no contractor, or 0% and overdue
      if (
        !p.project_end_date ||
        p.contract_value === 0 ||
        !p.contractors?.trim() ||
        (p.completion_percent === 0 && (p.days_overdue ?? 0) > 0)
      ) {
        missingDataCount++;
      }
    }

    return {
      totalExposure,
      avgCompletion: Math.round((totalCompletion / projects.length) * 10) / 10,
      criticalCount,
      missingDataCount,
    };
  }, [projects]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <WarRoomKpiCard
        label="Remaining Exposure"
        value={fmtCurrency(stats.totalExposure / 100)}
        icon={DollarSign}
        accent="text-amber-400"
        bgAccent="bg-amber-500/15"
        alert={stats.totalExposure > 0}
      />
      <WarRoomKpiCard
        label="Avg. Completion"
        value={`${stats.avgCompletion}%`}
        icon={TrendingUp}
        accent="text-blue-400"
        bgAccent="bg-blue-500/15"
      />
      <WarRoomKpiCard
        label="Critical"
        value={stats.criticalCount.toLocaleString()}
        sub=">1yr overdue & >$1B remaining"
        icon={AlertTriangle}
        accent={stats.criticalCount > 0 ? 'text-red-400' : 'text-emerald-400'}
        bgAccent={stats.criticalCount > 0 ? 'bg-red-500/15' : 'bg-emerald-500/15'}
        alert={stats.criticalCount > 0}
      />
      <WarRoomKpiCard
        label="Missing Data"
        value={stats.missingDataCount.toLocaleString()}
        sub="Incomplete project records"
        icon={FileWarning}
        accent={stats.missingDataCount > 0 ? 'text-orange-400' : 'text-emerald-400'}
        bgAccent={stats.missingDataCount > 0 ? 'bg-orange-500/15' : 'bg-emerald-500/15'}
      />
    </div>
  );
}
