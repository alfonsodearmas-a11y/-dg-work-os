'use client';

import { useState } from 'react';
import { AlertCircle, FileSignature, Loader2 } from 'lucide-react';
import type { EscalateSourceType } from './escalate-types';

interface ReferToMinisterDialogProps {
  sourceType: EscalateSourceType;
  sourceId: string | null;
  preFillTitle?: string | null;
  preFillAgency?: string | null;
  onSubmitted: (result: { taskId: string }) => void;
  onCancel: () => void;
}

const inputCls =
  'w-full px-3 py-2 bg-navy-950 border border-navy-800 rounded-lg text-white placeholder-navy-600 focus:outline-none focus:border-gold-500 transition-colors';

export function ReferToMinisterDialog(props: ReferToMinisterDialogProps) {
  const isFlagExisting = props.sourceType === 'task' && !!props.sourceId;
  const defaultTitle =
    !isFlagExisting && props.preFillTitle
      ? `Refer to Minister: ${props.preFillTitle}`
      : '';
  const [title, setTitle] = useState(defaultTitle);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitDisabled =
    submitting || !note.trim() || (!isFlagExisting && !title.trim());

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      let res: Response;
      if (isFlagExisting && props.sourceId) {
        res = await fetch(
          `/api/tasks/${encodeURIComponent(props.sourceId)}/refer`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ openingComment: note.trim() }),
          },
        );
      } else {
        const linkedSourceType =
          props.sourceType === 'tender' || props.sourceType === 'project'
            ? props.sourceType
            : null;
        const linkedSourceId = linkedSourceType && props.sourceId ? props.sourceId : null;
        res = await fetch('/api/tasks/refer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim(),
            openingComment: note.trim(),
            agency: props.preFillAgency ?? null,
            linkedSourceType,
            linkedSourceId,
          }),
        });
      }
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Submit failed');
      props.onSubmitted({ taskId: j.taskId });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!submitDisabled) submit();
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex items-center gap-2 text-sm text-navy-600">
        <FileSignature size={16} aria-hidden="true" />
        <span>Refer to Minister</span>
      </div>

      {!isFlagExisting && (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-navy-500">
            Task title <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputCls}
            placeholder="Refer to Minister: …"
            required
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold uppercase tracking-wider text-navy-500">
          Opening note <span className="text-red-400">*</span>
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={5}
          className={inputCls}
          placeholder="What is the Minister being asked to do?"
          required
        />
      </div>

      {error && (
        <p className="text-xs text-red-400 flex items-center gap-2">
          <AlertCircle size={12} /> {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3 pt-2">
        <button
          type="submit"
          disabled={submitDisabled}
          className="btn-gold text-sm disabled:opacity-50"
        >
          {submitting ? (
            <span className="flex items-center gap-2">
              <Loader2 size={12} className="animate-spin" /> Submitting
            </span>
          ) : isFlagExisting ? (
            'Refer this task'
          ) : (
            'Create and refer'
          )}
        </button>
        <button
          type="button"
          onClick={props.onCancel}
          className="text-sm text-navy-500 hover:text-white px-3"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
