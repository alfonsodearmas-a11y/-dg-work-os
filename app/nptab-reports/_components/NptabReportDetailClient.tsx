'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Download } from 'lucide-react';
import { fmtBudgetAmount, fmtGuyanaDate, fmtGuyanaDateTime } from '@/lib/format';
import { containsEmDash } from '@/lib/referrals/em-dash-guard';
import { periodLabel } from '@/lib/nptab/period';
import { buildAggregates } from '@/lib/nptab/aggregate';
import {
  NPTAB_DELIVERY_LABELS,
  NPTAB_DELIVERY_METHODS,
  type NptabAuditEntry,
  type NptabDeliveryMethod,
  type NptabReport,
  type NptabReportTenderSnapshot,
} from '@/lib/nptab/types';
import { NptabReportStatusBadge } from '@/components/nptab/NptabReportStatusBadge';
import { AggregateBlocks } from './AggregateBlocks';

interface Props {
  report: NptabReport;
  tenders: NptabReportTenderSnapshot[];
  audit: NptabAuditEntry[];
  userLookup: Record<string, string>;
  canEdit: boolean;
}

export function NptabReportDetailClient({ report, tenders, audit, userLookup, canEdit }: Props) {
  const router = useRouter();
  const isDraft = report.status === 'drafted';
  const aggregates = useMemo(() => buildAggregates(tenders), [tenders]);
  const sortedTenders = useMemo(
    () => [...tenders].sort((a, b) => (b.days_past_sla ?? 0) - (a.days_past_sla ?? 0)),
    [tenders],
  );

  const [narrative, setNarrative] = useState(report.narrative);
  const [savingNarrative, setSavingNarrative] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState<NptabDeliveryMethod>('email');
  const [deliveredTo, setDeliveredTo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const narrativeHasEmDash = containsEmDash(narrative);

  async function saveNarrative() {
    setSavingNarrative(true);
    setError(null);
    try {
      const res = await fetch(`/api/nptab-reports/${report.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ narrative }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Save failed');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingNarrative(false);
    }
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/nptab-reports/${report.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delivery_method: deliveryMethod, delivered_to: deliveredTo }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Submit failed');
      router.refresh();
      setSubmitOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function closeReport() {
    const reason = window.prompt('Close this report. Reason?');
    if (reason === null) return;
    setError(null);
    try {
      const res = await fetch(`/api/nptab-reports/${report.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closure_reason: reason }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Close failed');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Close failed');
    }
  }

  async function removeTender(tenderId: string) {
    if (!window.confirm('Remove this tender from the report?')) return;
    try {
      const res = await fetch(`/api/nptab-reports/${report.id}/tenders?tender_id=${encodeURIComponent(tenderId)}`, {
        method: 'DELETE',
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Remove failed');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Remove failed');
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">
              {periodLabel(report.period_start, report.period_end)}
            </h1>
            <NptabReportStatusBadge status={report.status} />
          </div>
          <p className="text-sm text-navy-500">
            <span className="font-mono">{report.reference_number ?? 'DRAFT'}</span>
            {' · '}
            Generated {fmtGuyanaDate(report.generated_at)} by{' '}
            {userLookup[report.generated_by] ?? 'unknown'}
            {report.submitted_at && (
              <>
                {' · '}
                Submitted {fmtGuyanaDate(report.submitted_at)}
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/api/nptab-reports/${report.id}/pdf`}
            target="_blank"
            rel="noopener"
            className="btn-navy text-sm flex items-center gap-2"
          >
            <Download size={14} /> Download PDF
          </a>
          {canEdit && isDraft && (
            <button
              type="button"
              onClick={() => setSubmitOpen((v) => !v)}
              className="btn-gold text-sm"
            >
              Mark Submitted
            </button>
          )}
          {canEdit && report.status !== 'closed' && (
            <button
              type="button"
              onClick={closeReport}
              className="text-sm text-red-400 hover:text-red-300 px-3 py-2"
            >
              Close Report
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-900/40 border border-red-700/60 text-red-200 text-sm flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {submitOpen && (
        <section className="card-premium p-4 space-y-3">
          <h3 className="text-sm font-semibold text-white">Submit to NPTAB</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="block text-xs font-semibold uppercase tracking-wider text-navy-500 mb-1">
                Delivery method
              </span>
              <select
                value={deliveryMethod}
                onChange={(e) => setDeliveryMethod(e.target.value as NptabDeliveryMethod)}
                className="w-full px-3 py-2 bg-navy-950 border border-navy-800 rounded-lg text-white"
              >
                {NPTAB_DELIVERY_METHODS.map((m) => (
                  <option key={m} value={m}>{NPTAB_DELIVERY_LABELS[m]}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="block text-xs font-semibold uppercase tracking-wider text-navy-500 mb-1">
                Delivered to
              </span>
              <input
                type="text"
                value={deliveredTo}
                onChange={(e) => setDeliveredTo(e.target.value)}
                className="w-full px-3 py-2 bg-navy-950 border border-navy-800 rounded-lg text-white"
                placeholder="Recipient name or address"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !deliveredTo.trim()}
            className="btn-gold text-sm disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Confirm Submit'}
          </button>
        </section>
      )}

      <section className="card-premium p-4 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-navy-500">Included Tenders</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] font-semibold uppercase tracking-wider text-navy-500 border-b border-navy-800">
              <tr>
                <th className="px-2 py-2">Title</th>
                <th className="px-2 py-2">Agency</th>
                <th className="px-2 py-2 text-right">Value</th>
                <th className="px-2 py-2 text-right">Days Past SLA</th>
                <th className="px-2 py-2">Contractor</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {sortedTenders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-2 py-8 text-center text-navy-500">
                    No tenders included.
                  </td>
                </tr>
              ) : (
                sortedTenders.map((t) => (
                  <tr key={t.tender_id} className="border-b border-navy-800/60">
                    <td className="px-2 py-2 text-white max-w-[24rem] truncate">{t.title || t.tender_id}</td>
                    <td className="px-2 py-2 text-white">{t.agency || '-'}</td>
                    <td className="px-2 py-2 text-right text-navy-300 tabular-nums">
                      {t.contract_value != null ? fmtBudgetAmount(t.contract_value) : '-'}
                    </td>
                    <td className="px-2 py-2 text-right text-navy-300 tabular-nums">{t.days_past_sla ?? '-'}</td>
                    <td className="px-2 py-2 text-navy-300">{t.contractor || '-'}</td>
                    <td className="px-2 py-2 text-navy-300">{t.status || '-'}</td>
                    <td className="px-2 py-2 text-right">
                      {canEdit && isDraft && (
                        <button
                          type="button"
                          onClick={() => removeTender(t.tender_id)}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-navy-500">Aggregate Analysis</h2>
        <AggregateBlocks {...aggregates} />
      </section>

      <section className="card-premium p-4 space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-navy-500">Findings and Narrative</h2>
        {canEdit && isDraft ? (
          <>
            <textarea
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              rows={8}
              className={[
                'w-full px-3 py-2 bg-navy-950 border rounded-lg text-white',
                narrativeHasEmDash ? 'border-red-500/60' : 'border-navy-800 focus:border-gold-500',
                'focus:outline-none transition-colors',
              ].join(' ')}
              placeholder="Patterns, recurring contractors, anomalies, recommendations..."
            />
            {narrativeHasEmDash && (
              <p className="text-xs text-red-400">Em-dashes are not permitted.</p>
            )}
            <button
              type="button"
              onClick={saveNarrative}
              disabled={savingNarrative || narrativeHasEmDash}
              className="btn-navy text-sm disabled:opacity-50"
            >
              {savingNarrative ? 'Saving...' : 'Save Narrative'}
            </button>
          </>
        ) : (
          <pre className="whitespace-pre-wrap text-sm text-navy-200">{report.narrative || '-'}</pre>
        )}
      </section>

      <section className="card-premium p-4 space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-navy-500">Audit Log</h2>
        {audit.length === 0 ? (
          <p className="text-sm text-navy-500">No audit entries yet.</p>
        ) : (
          <ol className="space-y-2">
            {audit.map((e) => (
              <li key={e.id} className="text-sm flex flex-col gap-0.5 border-l-2 border-navy-800 pl-3 py-1">
                <span className="text-navy-500 font-mono text-xs">{fmtGuyanaDateTime(e.timestamp)}</span>
                <span className="text-white">
                  <span className="font-semibold">{e.field_changed}</span> by{' '}
                  <span className="text-navy-300">{userLookup[e.changed_by] ?? 'unknown'}</span>
                </span>
                {(e.old_value || e.new_value) && (
                  <span className="text-xs text-navy-400">
                    {e.old_value && <span className="text-red-400/80">{e.old_value}</span>}
                    {e.old_value && e.new_value && <span className="mx-2 text-navy-600">→</span>}
                    {e.new_value && <span className="text-emerald-400/80">{e.new_value}</span>}
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
