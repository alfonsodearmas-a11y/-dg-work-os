'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { fmtGuyanaDate } from '@/lib/format';
import { ReferralStatusBadge } from '@/components/referrals/ReferralStatusBadge';
import {
  REFERRAL_STATUSES,
  REQUESTED_ACTION_LABELS,
  STATUS_LABELS,
  type ReferralStatus,
  type ReferralSummary,
} from '@/lib/referrals/types';

export interface ReferralsTableProps {
  initial: ReferralSummary[];
  canEdit: boolean;
}

export function ReferralsTable({ initial, canEdit }: ReferralsTableProps) {
  const [statusFilter, setStatusFilter] = useState<Set<ReferralStatus>>(new Set());
  const [agencyFilter, setAgencyFilter] = useState<string>('');

  const agencies = useMemo(() => {
    const s = new Set<string>();
    initial.forEach((r) => s.add(r.agency));
    return [...s].sort();
  }, [initial]);

  const filtered = useMemo(() => {
    return initial.filter((r) => {
      if (statusFilter.size && !statusFilter.has(r.status)) return false;
      if (agencyFilter && r.agency !== agencyFilter) return false;
      return true;
    });
  }, [initial, statusFilter, agencyFilter]);

  function toggleStatus(s: ReferralStatus) {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Ministerial Referrals</h1>
          <p className="text-sm text-navy-500">
            {canEdit ? 'Track, deliver, and log outcomes for formal referrals.' : 'Read-only view of referrals to the Minister.'}
          </p>
        </div>
        <p className="text-sm text-navy-500">{filtered.length} of {initial.length} shown</p>
      </header>

      <div className="card-premium p-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {REFERRAL_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleStatus(s)}
              className={[
                'px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border transition-colors',
                statusFilter.has(s)
                  ? 'bg-gold-500 text-navy-950 border-gold-500'
                  : 'bg-navy-900 text-navy-400 border-navy-800 hover:border-gold-500/60',
              ].join(' ')}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        <select
          value={agencyFilter}
          onChange={(e) => setAgencyFilter(e.target.value)}
          className="px-3 py-1.5 bg-navy-950 border border-navy-800 rounded-lg text-white text-sm"
        >
          <option value="">All agencies</option>
          {agencies.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      <div className="card-premium overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] font-semibold uppercase tracking-wider text-navy-500 border-b border-navy-800">
            <tr>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Submitted</th>
              <th className="px-4 py-3">Agency</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Requested Action</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Days Since</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-navy-500">
                  No referrals match the current filters.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-b border-navy-800/60 hover:bg-navy-900/40">
                  <td className="px-4 py-3 font-mono text-gold-400">
                    <Link href={`/referrals/${r.id}`}>{r.reference_number ?? 'DRAFT'}</Link>
                  </td>
                  <td className="px-4 py-3 text-navy-300">{fmtGuyanaDate(r.submitted_at)}</td>
                  <td className="px-4 py-3 text-white">{r.agency}</td>
                  <td className="px-4 py-3 text-white max-w-[28rem] truncate">{r.title}</td>
                  <td className="px-4 py-3 text-navy-300">{REQUESTED_ACTION_LABELS[r.requested_action]}</td>
                  <td className="px-4 py-3"><ReferralStatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 text-right tabular-nums text-navy-300">
                    {r.days_since_submission ?? '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
