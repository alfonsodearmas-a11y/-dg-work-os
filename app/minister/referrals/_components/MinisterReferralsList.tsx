'use client';

import Link from 'next/link';
import { fmtGuyanaDate } from '@/lib/format';
import { ReferralStatusBadge } from '@/components/referrals/ReferralStatusBadge';
import {
  REQUESTED_ACTION_LABELS,
  type ReferralSummary,
} from '@/lib/referrals/types';

export function MinisterReferralsList({ referrals }: { referrals: ReferralSummary[] }) {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-white">Referrals from the Director General</h1>
        <p className="text-sm text-navy-500">
          {referrals.length} {referrals.length === 1 ? 'item' : 'items'}.
        </p>
      </header>

      <div className="card-premium overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] font-semibold uppercase tracking-wider text-navy-500 border-b border-navy-800">
            <tr>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Submitted</th>
              <th className="px-4 py-3">Agency</th>
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Requested</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {referrals.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-navy-500">
                  No referrals at this time.
                </td>
              </tr>
            ) : (
              referrals.map((r) => (
                <tr key={r.id} className="border-b border-navy-800/60 hover:bg-navy-900/40">
                  <td className="px-4 py-3 font-mono text-gold-400">
                    <Link href={`/minister/referrals/${r.id}`}>{r.reference_number ?? '—'}</Link>
                  </td>
                  <td className="px-4 py-3 text-navy-300">{fmtGuyanaDate(r.submitted_at)}</td>
                  <td className="px-4 py-3 text-white">{r.agency}</td>
                  <td className="px-4 py-3 text-white max-w-[28rem] truncate">{r.title}</td>
                  <td className="px-4 py-3 text-navy-300">{REQUESTED_ACTION_LABELS[r.requested_action]}</td>
                  <td className="px-4 py-3"><ReferralStatusBadge status={r.status} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
