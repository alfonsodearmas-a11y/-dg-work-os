'use client';

import type { OutreachAgencySummary } from '@/lib/direct-outreach/types';
import { OUTREACH_STALE_OFFICER_DAYS } from '@/lib/direct-outreach/types';
import { outreachAgencyColor, outreachAgencyName } from './shared';

interface AgencyScorecardsProps {
  agencies: OutreachAgencySummary[];
}

/** Per-agency scorecard table (Overview tab) — one compact row per agency,
 *  fed by the same summary payload the old card grid used. */
export function AgencyScorecards({ agencies }: AgencyScorecardsProps) {
  if (agencies.length === 0) return null;

  return (
    <div className="card-premium overflow-hidden">
      <div className="px-4 pt-4 pb-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-navy-600">
          Agency scorecards
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="table-premium">
          <thead>
            <tr>
              <th>Agency</th>
              <th className="text-right">Open</th>
              <th className="text-right">Unassigned</th>
              <th className="text-right" title="OP stalled — no movement in the imported OP Direct log for over 60 days">
                Stale (OP &gt;60d)
              </th>
              <th className="text-right" title={`No officer action in >${OUTREACH_STALE_OFFICER_DAYS} days`}>
                Officer stale
              </th>
              <th className="text-right" title="Officer-committed target dates past due">Overdue</th>
              <th className="text-right">Resolved</th>
              <th className="text-right" title="Resolved share of all cases">Resolution %</th>
            </tr>
          </thead>
          <tbody>
            {agencies.map((a) => (
              <tr key={a.agency}>
                <td>
                  <span className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: outreachAgencyColor(a.agency) }}
                      aria-hidden="true"
                    />
                    <span className="font-mono font-semibold text-xs tracking-wider text-white">
                      {a.agency}
                    </span>
                    <span className="text-xs text-navy-600 truncate hidden md:inline max-w-[220px]">
                      {outreachAgencyName(a.agency)}
                    </span>
                  </span>
                  {a.transferred_in > 0 && (
                    <span className="block text-[11px] text-amber-400/90 mt-0.5">
                      ▸ {a.transferred_in} transferred in
                    </span>
                  )}
                </td>
                <td className="text-right">
                  <span className="font-mono font-semibold tabular-nums text-gold-500">{a.open}</span>
                </td>
                <td className="text-right">
                  <span className={`font-mono font-semibold tabular-nums ${a.unassigned > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                    {a.unassigned}
                  </span>
                </td>
                <td className="text-right">
                  <span className={`font-mono font-semibold tabular-nums ${a.stalled_60 > 0 ? 'text-red-400' : 'text-slate-400'}`}>
                    {a.stalled_60}
                  </span>
                </td>
                <td className="text-right">
                  <span className={`font-mono font-semibold tabular-nums ${a.stale_officer > 0 ? 'text-red-400' : 'text-slate-400'}`}>
                    {a.stale_officer}
                  </span>
                </td>
                <td className="text-right">
                  <span className={`font-mono font-semibold tabular-nums ${a.officer_overdue > 0 ? 'text-red-400' : 'text-slate-400'}`}>
                    {a.officer_overdue}
                  </span>
                </td>
                <td className="text-right">
                  <span className="font-mono font-semibold tabular-nums text-emerald-400">{a.resolved}</span>
                </td>
                <td className="text-right">
                  <span
                    className="font-mono font-semibold tabular-nums text-slate-200"
                    title={`${a.resolved} of ${a.total} cases resolved`}
                  >
                    {a.resolution_rate === null ? '—' : `${a.resolution_rate}%`}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
