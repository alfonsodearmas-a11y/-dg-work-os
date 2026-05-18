'use client';

import { useEffect, useState } from 'react';
import { FileSignature, AlertCircle, Loader2 } from 'lucide-react';
import { containsEmDash } from '@/lib/referrals/em-dash-guard';
import {
  REQUESTED_ACTION_LABELS,
  SOURCE_TYPE_LABELS,
  type ReferralRequestedAction,
  type ReferralSourceType,
} from '@/lib/referrals/types';

interface ReferralFormProps {
  sourceType: ReferralSourceType;
  sourceId: string | null;
  preFillAgency?: string | null;
  preFillTitle?: string | null;
  onSubmitted: (result: { referralId: string; referenceNumber: string | null }) => void;
  onCancel: () => void;
}

interface PreFillResponse {
  agency: string;
  title: string;
  days_overdue: number | null;
  contract_value: number | null;
  background: string;
  current_status: string;
}

export function ReferralForm({
  sourceType,
  sourceId,
  preFillAgency,
  preFillTitle,
  onSubmitted,
  onCancel,
}: ReferralFormProps) {
  const [loadingPreFill, setLoadingPreFill] = useState(Boolean(sourceId));
  const isSourcelessMode = sourceId === null;
  const [selectedType, setSelectedType] = useState<ReferralSourceType>(sourceType);
  const [agency, setAgency] = useState(preFillAgency ?? '');
  const [title, setTitle] = useState(preFillTitle ?? '');
  const [background, setBackground] = useState('');
  const [currentStatus, setCurrentStatus] = useState('');
  const [recommendation, setRecommendation] = useState('');
  const [requestedAction, setRequestedAction] = useState<ReferralRequestedAction>('decision');
  const [daysOverdue, setDaysOverdue] = useState<number | null>(null);
  const [contractValue, setContractValue] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState<'idle' | 'draft' | 'submit'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sourceId) return;
    let cancelled = false;
    setLoadingPreFill(true);
    fetch(`/api/referrals/pre-fill?source_type=${sourceType}&source_id=${encodeURIComponent(sourceId)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('pre-fill fetch failed');
        const j = (await r.json()) as { preFill: PreFillResponse | null };
        if (cancelled || !j.preFill) return;
        setAgency((prev) => prev || j.preFill!.agency);
        setTitle((prev) => prev || j.preFill!.title);
        setBackground((prev) => prev || j.preFill!.background);
        setCurrentStatus((prev) => prev || j.preFill!.current_status);
        setDaysOverdue(j.preFill.days_overdue);
        setContractValue(j.preFill.contract_value);
      })
      .catch(() => { /* non-fatal */ })
      .finally(() => { if (!cancelled) setLoadingPreFill(false); });
    return () => { cancelled = true; };
  }, [sourceType, sourceId]);

  const recommendationLength = recommendation.trim().length;
  const recHasEmDash = containsEmDash(recommendation);
  const titleHasEmDash = containsEmDash(title);
  const bgHasEmDash = containsEmDash(background);
  const csHasEmDash = containsEmDash(currentStatus);
  const anyEmDash = recHasEmDash || titleHasEmDash || bgHasEmDash || csHasEmDash;
  const submitDisabled =
    submitting !== 'idle' ||
    !agency.trim() ||
    !title.trim() ||
    recommendationLength < 50 ||
    anyEmDash;

  async function save(action: 'draft' | 'submit') {
    setError(null);
    setSubmitting(action);
    try {
      const res = await fetch('/api/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          source_type: selectedType,
          source_id: sourceId,
          agency,
          title,
          days_overdue: daysOverdue,
          contract_value: contractValue,
          background,
          current_status: currentStatus,
          recommendation,
          requested_action: requestedAction,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Save failed');
      onSubmitted({
        referralId: json.referral.id,
        referenceNumber: json.referral.reference_number ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSubmitting('idle');
    }
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (!submitDisabled) save('submit'); }}
      className="flex flex-col gap-4"
    >
      <div className="flex items-center gap-2 text-sm text-navy-600">
        <FileSignature size={16} aria-hidden="true" />
        <span>Refer to Minister</span>
      </div>

      {loadingPreFill && (
        <p className="text-xs text-navy-500 flex items-center gap-2">
          <Loader2 size={12} className="animate-spin" /> Loading source data
        </p>
      )}

      {isSourcelessMode && (
        <Field label="Source Type" required>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as ReferralSourceType)}
            className={inputCls(false)}
          >
            {(Object.entries(SOURCE_TYPE_LABELS) as [ReferralSourceType, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Agency" required>
        <input
          type="text"
          value={agency}
          onChange={(e) => setAgency(e.target.value.toUpperCase())}
          className={inputCls(false)}
          placeholder="GPL"
          required
        />
      </Field>

      <Field label="Subject" required emDash={titleHasEmDash}>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputCls(titleHasEmDash)}
          required
        />
      </Field>

      <Field label="Background" emDash={bgHasEmDash}>
        <textarea
          value={background}
          onChange={(e) => setBackground(e.target.value)}
          rows={4}
          className={inputCls(bgHasEmDash)}
        />
      </Field>

      <Field label="Current Status" emDash={csHasEmDash}>
        <textarea
          value={currentStatus}
          onChange={(e) => setCurrentStatus(e.target.value)}
          rows={3}
          className={inputCls(csHasEmDash)}
        />
      </Field>

      <Field
        label="Recommendation"
        required
        emDash={recHasEmDash}
        hint={`${recommendationLength}/50 characters minimum`}
        hintColor={recommendationLength >= 50 ? 'text-emerald-400' : 'text-navy-500'}
      >
        <textarea
          value={recommendation}
          onChange={(e) => setRecommendation(e.target.value)}
          rows={6}
          className={inputCls(recHasEmDash)}
          required
        />
      </Field>

      <Field label="Requested Action" required>
        <select
          value={requestedAction}
          onChange={(e) => setRequestedAction(e.target.value as ReferralRequestedAction)}
          className={inputCls(false)}
        >
          {(Object.entries(REQUESTED_ACTION_LABELS) as [ReferralRequestedAction, string][]).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </Field>

      {anyEmDash && (
        <p className="text-xs text-red-400 flex items-center gap-2">
          <AlertCircle size={12} /> Em-dashes (—) are not allowed. Use a comma or rephrase.
        </p>
      )}

      {error && (
        <p className="text-xs text-red-400 flex items-center gap-2">
          <AlertCircle size={12} /> {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3 pt-2">
        <button
          type="button"
          onClick={() => save('draft')}
          disabled={submitting !== 'idle' || !agency.trim() || !title.trim() || anyEmDash}
          className="btn-navy text-sm disabled:opacity-50"
        >
          {submitting === 'draft' ? 'Saving…' : 'Save Draft'}
        </button>
        <button
          type="submit"
          disabled={submitDisabled}
          className="btn-gold text-sm disabled:opacity-50"
        >
          {submitting === 'submit' ? 'Submitting…' : 'Submit Referral'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-navy-500 hover:text-white px-3"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  hint,
  hintColor = 'text-navy-500',
  emDash,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  hintColor?: string;
  emDash?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-wider text-navy-500">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
      <div className="flex justify-between text-xs">
        {hint ? <span className={hintColor}>{hint}</span> : <span />}
        {emDash && <span className="text-red-400">Contains em-dash</span>}
      </div>
    </div>
  );
}

function inputCls(hasError: boolean): string {
  return [
    'w-full px-3 py-2 bg-navy-950 border rounded-lg text-white placeholder-navy-600',
    hasError ? 'border-red-500/60' : 'border-navy-800 focus:border-gold-500',
    'focus:outline-none transition-colors',
  ].join(' ');
}
