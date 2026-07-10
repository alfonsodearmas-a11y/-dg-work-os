'use client';

// Direct Outreach v3 — per-officer accountability strip: open cases, stale
// cases (>14d without officer action), overdue officer commitments, and the
// officer's own last update. Row click filters the case list to that officer.

import { formatDistanceToNow, parseISO } from 'date-fns';
import { Users } from 'lucide-react';
import type { OutreachOfficerLoad } from '@/lib/direct-outreach/types';
import { OUTREACH_STALE_OFFICER_DAYS } from '@/lib/direct-outreach/types';
import { initials } from './shared';

interface OfficerLoadTableProps {
  officers: OutreachOfficerLoad[];
  onSelect: (officerId: string) => void;
}

export function OfficerLoadTable({ officers, onSelect }: OfficerLoadTableProps) {
  if (officers.length === 0) return null;

  return (
    <div className="card-premium overflow-hidden">
      <div className="flex items-center gap-2 px-4 pt-4 pb-1">
        <Users size={14} className="text-gold-500" aria-hidden="true" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-navy-600">
          Officer workload
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="table-premium">
          <thead>
            <tr>
              <th>Officer</th>
              <th className="text-right">Open</th>
              <th className="text-right" title={`No officer action in >${OUTREACH_STALE_OFFICER_DAYS} days`}>
                Stale
              </th>
              <th className="text-right">Overdue</th>
              <th>Last update</th>
            </tr>
          </thead>
          <tbody>
            {officers.map((o) => (
              <tr
                key={o.id}
                onClick={() => onSelect(o.id)}
                className="cursor-pointer"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(o.id);
                  }
                }}
              >
                <td>
                  <span className="flex items-center gap-2" title={o.name ?? undefined}>
                    <span className="w-6 h-6 rounded-full bg-navy-800 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0">
                      {initials(o.name)}
                    </span>
                    <span className="text-sm text-white truncate max-w-[160px]">{o.name ?? 'Unknown'}</span>
                    {o.agency && <span className="text-[11px] text-navy-600">{o.agency}</span>}
                  </span>
                </td>
                <td className="text-right">
                  <span className="font-semibold tabular-nums text-slate-200">{o.open_cases}</span>
                </td>
                <td className="text-right">
                  <span className={`font-semibold tabular-nums ${o.stale_cases > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {o.stale_cases}
                  </span>
                </td>
                <td className="text-right">
                  <span className={`font-semibold tabular-nums ${o.overdue_commitments > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {o.overdue_commitments}
                  </span>
                </td>
                <td>
                  <span className="text-xs text-slate-400">
                    {o.last_update_at
                      ? formatDistanceToNow(parseISO(o.last_update_at), { addSuffix: true })
                      : <span className="text-red-400">never</span>}
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
