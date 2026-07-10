'use client';

import type { OutreachAgencySummary } from '@/lib/direct-outreach/types';
import { outreachAgencyColor, outreachAgencyName } from './shared';

interface AgencyScorecardsProps {
  agencies: OutreachAgencySummary[];
}

/** Per-agency resolution scorecards — CSS bar, no chart library (Today-module style). */
export function AgencyScorecards({ agencies }: AgencyScorecardsProps) {
  if (agencies.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {agencies.map((a) => {
        const color = outreachAgencyColor(a.agency);
        const rate = a.resolution_rate ?? 0;
        return (
          <article key={a.agency} className="card-premium p-4 lg:p-5" aria-label={`${a.agency} scorecard`}>
            <div className="flex items-baseline justify-between gap-2 mb-4">
              <span className="font-mono font-semibold tracking-wider" style={{ color }}>
                {a.agency}
              </span>
              <span className="text-xs text-navy-600 truncate">{outreachAgencyName(a.agency)}</span>
            </div>

            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-semibold uppercase tracking-[0.14em] text-navy-600 text-[11px]">
                Resolution rate
              </span>
              <span className="font-semibold text-slate-400 tabular-nums">
                {a.resolution_rate === null ? '—' : `${a.resolution_rate}%`}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-navy-800 overflow-hidden" role="presentation">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{ width: `${Math.min(Math.max(rate, 0), 100)}%`, background: color }}
              />
            </div>

            <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-navy-800/40">
              <div>
                <p className="text-lg font-bold text-white tabular-nums leading-none">{a.total}</p>
                <p className="text-[11px] uppercase tracking-wider text-navy-600 mt-1">Total</p>
              </div>
              <div>
                <p className="text-lg font-bold text-emerald-400 tabular-nums leading-none">{a.resolved}</p>
                <p className="text-[11px] uppercase tracking-wider text-navy-600 mt-1">Resolved</p>
              </div>
              <div>
                <p className="text-lg font-bold text-gold-500 tabular-nums leading-none">{a.open}</p>
                <p className="text-[11px] uppercase tracking-wider text-navy-600 mt-1">Open</p>
              </div>
            </div>
            {/* v3 accountability row — officer-activity signals */}
            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-navy-800/40">
              <div>
                <p className={`text-lg font-bold tabular-nums leading-none ${a.unassigned > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                  {a.unassigned}
                </p>
                <p className="text-[11px] uppercase tracking-wider text-navy-600 mt-1">Unassigned</p>
              </div>
              <div>
                <p className={`text-lg font-bold tabular-nums leading-none ${a.stale_officer > 0 ? 'text-red-400' : 'text-slate-400'}`}>
                  {a.stale_officer}
                </p>
                <p className="text-[11px] uppercase tracking-wider text-navy-600 mt-1">Stale</p>
              </div>
              <div>
                <p className={`text-lg font-bold tabular-nums leading-none ${a.officer_overdue > 0 ? 'text-red-400' : 'text-slate-400'}`}>
                  {a.officer_overdue}
                </p>
                <p className="text-[11px] uppercase tracking-wider text-navy-600 mt-1">Overdue</p>
              </div>
            </div>
            {a.transferred_in > 0 && (
              <p className="text-[11px] text-amber-400/90 mt-2">
                ▸ {a.transferred_in} transferred in
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}
