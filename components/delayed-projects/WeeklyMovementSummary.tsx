'use client';

import { TrendingUp, TrendingDown, Minus, PlusCircle, MinusCircle, RotateCcw } from 'lucide-react';
import type { WeeklyMovement } from '@/lib/delayed-projects/types';
import { getShortName } from '@/lib/delayed-projects/short-names';
import { AgencyBadge } from './shared';

interface WeeklyMovementSummaryProps {
  movement: WeeklyMovement;
}

export function WeeklyMovementSummary({ movement }: WeeklyMovementSummaryProps) {
  const hasMovers = movement.top_movers.length > 0;
  const hasStalls = movement.top_stalls.length > 0;

  return (
    <div className="card-premium p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Weekly Movement</h3>
        <span className="text-[10px] text-navy-600">
          Since last upload{' '}
          <span className="opacity-60">
            ({new Date(movement.previous_date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })})
          </span>
        </span>
      </div>

      {/* Summary pills */}
      <div className="flex flex-wrap gap-2">
        <Pill icon={TrendingUp} count={movement.progressed} label="progressed" color="text-emerald-400" bg="bg-emerald-500/10" />
        <Pill icon={Minus} count={movement.stalled} label="stalled" color="text-slate-400" bg="bg-slate-500/10" />
        <Pill icon={TrendingDown} count={movement.regressed} label="regressed" color="text-red-400" bg="bg-red-500/10" />
        {movement.new_entries > 0 && (
          <Pill icon={PlusCircle} count={movement.new_entries} label="new" color="text-blue-400" bg="bg-blue-500/10" />
        )}
        {(movement.cleared ?? 0) > 0 && (
          <Pill icon={MinusCircle} count={movement.cleared ?? 0} label="cleared" color="text-amber-400" bg="bg-amber-500/10" />
        )}
        {(movement.reopened ?? 0) > 0 && (
          <Pill icon={RotateCcw} count={movement.reopened ?? 0} label="reopened" color="text-blue-400" bg="bg-blue-500/10" />
        )}
      </div>

      {/* Top movers and stalls */}
      {(hasMovers || hasStalls) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {hasMovers && (
            <div>
              <p className="text-xs text-emerald-400 font-medium mb-2">Top Movers</p>
              <div className="space-y-1.5">
                {movement.top_movers.map((d) => (
                  <div key={d.project_id} className="flex items-center gap-2 text-xs">
                    <AgencyBadge agency={d.sub_agency} />
                    <span className="text-white flex-1">{getShortName(d.project_name)}</span>
                    <span className="text-emerald-400 font-medium tabular-nums">+{d.delta.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {hasStalls && (
            <div>
              <p className="text-xs text-red-400 font-medium mb-2">Stalled</p>
              <div className="space-y-1.5">
                {movement.top_stalls.map((d) => (
                  <div key={d.project_id} className="flex items-center gap-2 text-xs">
                    <AgencyBadge agency={d.sub_agency} />
                    <span className="text-white flex-1">{getShortName(d.project_name)}</span>
                    <span className="text-slate-500 tabular-nums">{d.current_pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Pill({ icon: Icon, count, label, color, bg }: {
  icon: typeof TrendingUp; count: number; label: string; color: string; bg: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${color} ${bg}`}>
      <Icon className="w-3.5 h-3.5" />
      {count} {label}
    </span>
  );
}
