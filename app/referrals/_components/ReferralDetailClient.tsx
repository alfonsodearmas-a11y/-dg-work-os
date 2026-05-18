'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Download, Trash2 } from 'lucide-react';
import { ReferralStatusBadge } from '@/components/referrals/ReferralStatusBadge';
import { ReferralAuditList } from './ReferralAuditList';
import { containsEmDash } from '@/lib/referrals/em-dash-guard';
import { fmtGuyanaDateTime } from '@/lib/format';
import {
  DELIVERY_METHOD_LABELS,
  REQUESTED_ACTION_LABELS,
  STATUS_LABELS,
  type ReferralAuditEntry,
  type ReferralDeliveryMethod,
  type ReferralStatus,
  type ReferralWithReferrer,
} from '@/lib/referrals/types';

interface Props {
  referral: ReferralWithReferrer;
  audit: ReferralAuditEntry[];
  userLookup: Record<string, string>;
  canEdit: boolean;
}

export function ReferralDetailClient({ referral, audit, userLookup, canEdit }: Props) {
  const router = useRouter();
  const isDraft = referral.status === 'drafted';

  const [deliveryMethod, setDeliveryMethod] = useState<ReferralDeliveryMethod | ''>(
    referral.delivery_method ?? '',
  );
  const [deliveredTo, setDeliveredTo] = useState(referral.delivered_to ?? '');
  const [direction, setDirection] = useState(referral.minister_direction ?? '');
  const [closureNote, setClosureNote] = useState(referral.closure_note ?? '');
  const [overrideStatus, setOverrideStatus] = useState<ReferralStatus | ''>('');
  const [overrideReason, setOverrideReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/referrals/${referral.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Update failed');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function deleteDraft() {
    if (!confirm('Delete this draft? This cannot be undone.')) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/referrals/${referral.id}`, { method: 'DELETE' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'Delete failed');
      router.push('/referrals');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
      setBusy(false);
    }
  }

  const directionHasEmDash = containsEmDash(direction);
  const closureHasEmDash = containsEmDash(closureNote);
  const deliveredToHasEmDash = containsEmDash(deliveredTo);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{referral.title}</h1>
            <ReferralStatusBadge status={referral.status} />
          </div>
          <p className="text-sm text-navy-500">
            <span className="font-mono">{referral.reference_number ?? 'DRAFT'}</span>
            {' · '}
            {referral.agency}
            {' · '}
            Submitted {fmtGuyanaDateTime(referral.submitted_at)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/referrals/${referral.id}/pdf`}
            target="_blank"
            rel="noopener"
            className="btn-navy text-sm flex items-center gap-2"
          >
            <Download size={14} /> Download PDF
          </a>
          {canEdit && isDraft && (
            <button
              type="button"
              onClick={deleteDraft}
              className="text-sm text-red-400 hover:text-red-300 flex items-center gap-1.5 px-3 py-2"
            >
              <Trash2 size={14} /> Delete Draft
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-900/40 border border-red-700/60 text-red-200 text-sm flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <Section title="Referral Details">
        <Grid>
          <Field label="Requested Action">
            <p className="text-white">{REQUESTED_ACTION_LABELS[referral.requested_action]}</p>
          </Field>
          <Field label="Days overdue at submission">
            <p className="text-white tabular-nums">{referral.days_overdue ?? '—'}</p>
          </Field>
          {referral.contract_value != null && (
            <Field label="Contract value">
              <p className="text-white tabular-nums">G${Math.round(referral.contract_value).toLocaleString('en-GY')}</p>
            </Field>
          )}
          <Field label="Referred by">
            <p className="text-white">{referral.referrer_name ?? '—'}</p>
          </Field>
        </Grid>

        <Field label="Background">
          <pre className="whitespace-pre-wrap text-sm text-navy-200">{referral.background || '—'}</pre>
        </Field>
        <Field label="Current Status">
          <pre className="whitespace-pre-wrap text-sm text-navy-200">{referral.current_status || '—'}</pre>
        </Field>
        <Field label="Recommendation">
          <pre className="whitespace-pre-wrap text-sm text-navy-200">{referral.recommendation}</pre>
        </Field>

        {isDraft && canEdit && (
          <p className="text-xs text-amber-400">
            This referral is a draft. To submit it, open the original escalation modal and submit from there, or delete the draft.
          </p>
        )}
      </Section>

      <Section title="Delivery Log">
        <Grid>
          <Field label="Delivery method">
            {canEdit ? (
              <select
                value={deliveryMethod}
                onChange={(e) => setDeliveryMethod(e.target.value as ReferralDeliveryMethod | '')}
                className={inputCls(false)}
                disabled={busy || isDraft}
              >
                <option value="">Not set</option>
                {(Object.entries(DELIVERY_METHOD_LABELS) as [ReferralDeliveryMethod, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            ) : (
              <p className="text-white">{referral.delivery_method ? DELIVERY_METHOD_LABELS[referral.delivery_method] : '—'}</p>
            )}
          </Field>
          <Field label="Delivered to">
            {canEdit ? (
              <input
                type="text"
                value={deliveredTo}
                onChange={(e) => setDeliveredTo(e.target.value)}
                className={inputCls(deliveredToHasEmDash)}
                disabled={busy || isDraft}
              />
            ) : (
              <p className="text-white">{referral.delivered_to ?? '—'}</p>
            )}
          </Field>
          <Field label="Delivered at">
            <p className="text-navy-300">{fmtGuyanaDateTime(referral.delivered_at)}</p>
          </Field>
        </Grid>
        {canEdit && !isDraft && (
          <button
            type="button"
            onClick={() =>
              patch({
                delivery_method: deliveryMethod || null,
                delivered_to: deliveredTo || null,
              })
            }
            disabled={busy || deliveredToHasEmDash || (!deliveryMethod && !deliveredTo)}
            className="btn-navy text-sm disabled:opacity-50"
          >
            Save delivery
          </button>
        )}
      </Section>

      <Section title="Outcome Log">
        <Field label="Minister direction" emDash={directionHasEmDash}>
          {canEdit ? (
            <textarea
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
              rows={4}
              className={inputCls(directionHasEmDash)}
              disabled={busy || isDraft}
            />
          ) : (
            <pre className="whitespace-pre-wrap text-sm text-navy-200">{referral.minister_direction || '—'}</pre>
          )}
          {referral.direction_logged_at && (
            <p className="text-xs text-navy-500">Logged at {fmtGuyanaDateTime(referral.direction_logged_at)}</p>
          )}
        </Field>
        {canEdit && !isDraft && (
          <button
            type="button"
            onClick={() => patch({ minister_direction: direction })}
            disabled={busy || directionHasEmDash || !direction.trim()}
            className="btn-navy text-sm disabled:opacity-50"
          >
            Save direction
          </button>
        )}

        <Field label="Closure note" emDash={closureHasEmDash}>
          {canEdit ? (
            <textarea
              value={closureNote}
              onChange={(e) => setClosureNote(e.target.value)}
              rows={3}
              className={inputCls(closureHasEmDash)}
              disabled={busy || isDraft}
            />
          ) : (
            <pre className="whitespace-pre-wrap text-sm text-navy-200">{referral.closure_note || '—'}</pre>
          )}
          {referral.closed_at && (
            <p className="text-xs text-navy-500">Closed at {fmtGuyanaDateTime(referral.closed_at)}</p>
          )}
        </Field>
        {canEdit && !isDraft && (
          <button
            type="button"
            onClick={() => patch({ closure_note: closureNote })}
            disabled={busy || closureHasEmDash || !closureNote.trim()}
            className="btn-navy text-sm disabled:opacity-50"
          >
            Close referral
          </button>
        )}
      </Section>

      {canEdit && (
        <Section title="Override status">
          <p className="text-xs text-navy-500">
            DG override. Records the reason in the audit log.
          </p>
          <Grid>
            <Field label="Target status">
              <select
                value={overrideStatus}
                onChange={(e) => setOverrideStatus(e.target.value as ReferralStatus | '')}
                className={inputCls(false)}
                disabled={busy}
              >
                <option value="">Select…</option>
                {(Object.entries(STATUS_LABELS) as [ReferralStatus, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </Field>
            <Field label="Reason">
              <input
                type="text"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                className={inputCls(false)}
                disabled={busy}
              />
            </Field>
          </Grid>
          <button
            type="button"
            onClick={() => patch({ status: overrideStatus, manualOverrideReason: overrideReason })}
            disabled={busy || !overrideStatus || !overrideReason.trim()}
            className="btn-navy text-sm disabled:opacity-50"
          >
            Apply override
          </button>
        </Section>
      )}

      <Section title="Audit log">
        <ReferralAuditList entries={audit} userLookup={userLookup} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card-premium p-6 space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-navy-500">{title}</h2>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>;
}

function Field({
  label,
  emDash,
  children,
}: {
  label: string;
  emDash?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-wider text-navy-500">
        {label}
      </label>
      {children}
      {emDash && <p className="text-xs text-red-400">Em-dash not permitted</p>}
    </div>
  );
}

function inputCls(hasError: boolean): string {
  return [
    'w-full px-3 py-2 bg-navy-950 border rounded-lg text-white placeholder-navy-600',
    hasError ? 'border-red-500/60' : 'border-navy-800 focus:border-gold-500',
    'focus:outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed',
  ].join(' ');
}
