'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, AlertCircle, Download } from 'lucide-react';
import { containsEmDash } from '@/lib/referrals/em-dash-guard';
import type { ReferralWithReferrer } from '@/lib/referrals/types';

interface Props {
  referral: ReferralWithReferrer;
}

export function MinisterReferralActions({ referral }: Props) {
  const router = useRouter();
  const [acknowledging, setAcknowledging] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const noteHasEmDash = containsEmDash(noteText);
  const alreadyAcknowledged = Boolean(referral.minister_acknowledged_at);

  async function acknowledge() {
    setAcknowledging(true);
    setError(null);
    try {
      const res = await fetch(`/api/referrals/${referral.id}/acknowledge`, { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Acknowledge failed');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Acknowledge failed');
    } finally {
      setAcknowledging(false);
    }
  }

  async function addNote() {
    setSubmittingNote(true);
    setError(null);
    try {
      const res = await fetch(`/api/referrals/${referral.id}/note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: noteText }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Add note failed');
      setNoteText('');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Add note failed');
    } finally {
      setSubmittingNote(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="px-3 py-2 rounded-lg bg-red-900/40 border border-red-700/60 text-red-200 text-sm flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <a
          href={`/api/referrals/${referral.id}/pdf`}
          target="_blank"
          rel="noopener"
          className="btn-navy text-sm flex items-center gap-2"
        >
          <Download size={14} /> Download PDF
        </a>
        <button
          type="button"
          onClick={acknowledge}
          disabled={acknowledging || alreadyAcknowledged}
          className="btn-gold text-sm flex items-center gap-2 disabled:opacity-50"
        >
          <Check size={14} />
          {alreadyAcknowledged ? 'Acknowledged' : acknowledging ? 'Acknowledging…' : 'Mark Acknowledged'}
        </button>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-navy-500">
          Add a note
        </label>
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          rows={3}
          className={[
            'w-full px-3 py-2 bg-navy-950 border rounded-lg text-white placeholder-navy-600',
            noteHasEmDash ? 'border-red-500/60' : 'border-navy-800 focus:border-gold-500',
            'focus:outline-none transition-colors',
          ].join(' ')}
          placeholder="Your note for the DG"
        />
        {noteHasEmDash && (
          <p className="text-xs text-red-400">Em-dashes (—) are not allowed.</p>
        )}
        <button
          type="button"
          onClick={addNote}
          disabled={submittingNote || !noteText.trim() || noteHasEmDash}
          className="btn-navy text-sm disabled:opacity-50"
        >
          {submittingNote ? 'Saving…' : 'Add note'}
        </button>
      </div>

      {referral.minister_notes && (
        <div className="space-y-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-navy-500">Previous notes</h3>
          <pre className="whitespace-pre-wrap text-sm text-navy-200 bg-navy-950/60 border border-navy-800 rounded-lg p-3">
            {referral.minister_notes}
          </pre>
        </div>
      )}
    </div>
  );
}
