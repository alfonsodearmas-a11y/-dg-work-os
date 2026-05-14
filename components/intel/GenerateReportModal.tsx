'use client';

import { useState, useEffect, useRef } from 'react';
import { FileDown, Loader2, X, Send } from 'lucide-react';
import { validateEmailList, parseEmailList } from '@/lib/email-validation';

interface Props {
  agency: string;
  agencyDisplay: string; // "GPL", "MARAD", etc. for the button label / heading.
}

/**
 * "Generate Report" button + modal — appears in each /intel/[agency] page
 * header. Posts to /api/intel/[agency]/report which renders + emails a
 * PDF with the triggering user as Reply-To and logs to agency_intel_reports.
 *
 * UX: chip-style recipient field (paste comma-separated, validate locally),
 * optional message, send button. Shows 429 + invalid-recipient feedback inline.
 */
export function GenerateReportButton({ agency, agencyDisplay }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-navy-900 border border-navy-800 hover:border-gold-500 text-slate-300 hover:text-white text-sm transition-colors"
      >
        <FileDown className="h-4 w-4" aria-hidden="true" />
        Generate Report
      </button>
      {open ? (
        <GenerateReportModal
          agency={agency}
          agencyDisplay={agencyDisplay}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function GenerateReportModal({
  agency,
  agencyDisplay,
  onClose,
}: Props & { onClose: () => void }) {
  const [recipientInput, setRecipientInput] = useState('');
  const [chips, setChips] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<
    | { kind: 'invalid'; bad: string[] }
    | { kind: 'rate_limit'; message: string }
    | { kind: 'error'; message: string }
    | { kind: 'success'; sent: string[] }
    | null
  >(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function commitInput() {
    const candidates = parseEmailList(recipientInput);
    if (candidates.length === 0) return;
    const { valid, invalid } = validateEmailList([...chips, ...candidates]);
    setChips(valid);
    setRecipientInput('');
    if (invalid.length > 0) {
      setFeedback({ kind: 'invalid', bad: invalid });
    } else {
      setFeedback(null);
    }
  }

  function removeChip(email: string) {
    setChips(chips.filter((c) => c !== email));
  }

  async function handleSubmit() {
    // Commit any unsubmitted text from the input
    let recipients = chips;
    if (recipientInput.trim()) {
      const candidates = parseEmailList(recipientInput);
      const { valid, invalid } = validateEmailList([...chips, ...candidates]);
      if (invalid.length > 0) {
        setFeedback({ kind: 'invalid', bad: invalid });
        return;
      }
      recipients = valid;
      setChips(valid);
      setRecipientInput('');
    }
    if (recipients.length === 0) {
      setFeedback({ kind: 'error', message: 'Add at least one recipient' });
      return;
    }

    setSending(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/intel/${agency}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients,
          message: message.trim() || undefined,
        }),
      });
      if (res.status === 429) {
        const body = await res.json().catch(() => ({}));
        setFeedback({
          kind: 'rate_limit',
          message: body.message || 'Rate limit reached. Try again in an hour.',
        });
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setFeedback({
          kind: 'error',
          message: body.error || `Send failed (HTTP ${res.status})`,
        });
        return;
      }
      const body = (await res.json()) as { sent_to: string[] };
      setFeedback({ kind: 'success', sent: body.sent_to });
      // Auto-close on success after 1.5s
      setTimeout(onClose, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error';
      setFeedback({ kind: 'error', message: msg });
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="generate-report-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-xl bg-navy-900 border border-gold-500/40 shadow-xl">
        <header className="flex items-center justify-between px-5 py-3.5 border-b border-navy-800">
          <h2 id="generate-report-title" className="text-base font-semibold text-white">
            Send {agencyDisplay} Intel Report
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-navy-600 hover:text-white hover:bg-navy-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-navy-600 mb-1.5">
              Recipients
            </label>
            <div className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-navy-950 border border-navy-800 focus-within:border-gold-500/60">
              {chips.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-navy-800 text-xs text-white"
                >
                  {email}
                  <button
                    type="button"
                    onClick={() => removeChip(email)}
                    aria-label={`Remove ${email}`}
                    className="text-navy-600 hover:text-red-400"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                ref={inputRef}
                type="text"
                value={recipientInput}
                onChange={(e) => setRecipientInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',' || e.key === ' ' || e.key === 'Tab') {
                    if (recipientInput.trim()) {
                      e.preventDefault();
                      commitInput();
                    }
                  }
                  if (
                    e.key === 'Backspace' &&
                    recipientInput.length === 0 &&
                    chips.length > 0
                  ) {
                    setChips(chips.slice(0, -1));
                  }
                }}
                onBlur={() => {
                  if (recipientInput.trim()) commitInput();
                }}
                placeholder={chips.length === 0 ? 'name@example.com, another@example.com' : ''}
                className="flex-1 min-w-[160px] bg-transparent border-none outline-none text-sm text-white placeholder-navy-600"
              />
            </div>
            <p className="text-[11px] text-navy-600 mt-1">
              Press Enter, comma, or space to add. Reply-To will be your address.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-navy-600 mb-1.5">
              Message (optional)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              maxLength={2000}
              className="w-full px-3 py-2 rounded-lg bg-navy-950 border border-navy-800 text-white text-sm placeholder-navy-600 focus:outline-none focus:border-gold-500 resize-none"
              placeholder="Optional note to include in the email body"
            />
          </div>

          {feedback?.kind === 'invalid' ? (
            <p className="text-xs text-red-400">
              Invalid email{feedback.bad.length === 1 ? '' : 's'}: {feedback.bad.join(', ')}
            </p>
          ) : null}
          {feedback?.kind === 'rate_limit' ? (
            <p className="text-xs text-amber-400">{feedback.message}</p>
          ) : null}
          {feedback?.kind === 'error' ? (
            <p className="text-xs text-red-400">{feedback.message}</p>
          ) : null}
          {feedback?.kind === 'success' ? (
            <p className="text-xs text-emerald-400">
              Sent to {feedback.sent.length} recipient{feedback.sent.length === 1 ? '' : 's'}.
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-navy-800">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="px-4 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-navy-800 transition-colors text-sm disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={sending || (chips.length === 0 && recipientInput.trim().length === 0)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gold-500 text-navy-950 font-medium hover:bg-[#c9a432] transition-colors disabled:opacity-50 text-sm"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send report
          </button>
        </footer>
      </div>
    </div>
  );
}
