'use client';

// Direct Outreach v3 — officer progress updates: composer + timeline, adapted
// from components/tasks/TaskComments.tsx (flat log, no threading — mentions
// cover directed conversation). The imported OP Direct comment log renders
// separately and stays visibly read-only; THIS list is the writable one.

import { useCallback, useRef, useState } from 'react';
import { Loader2, MessageSquarePlus, Send } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/Badge';
import { MentionAutocomplete, type MentionUser } from '@/components/tasks/MentionAutocomplete';
import { draftToRaw, renderMentionBody } from '@/components/mentions/mention-helpers';
import { fmtDate } from '@/lib/format';
import type { OutreachOfficerUpdate } from '@/lib/direct-outreach/types';
import { OUTREACH_WORKING_STATUS_LABELS } from '@/lib/direct-outreach/types';
import { WORKING_STATUS_VARIANTS, initials } from './shared';

/** Server-side zod cap on the RAW body (mentions expanded to @[uuid]). */
const MAX_RAW_BODY = 4000;

interface OfficerUpdatesProps {
  updates: OutreachOfficerUpdate[];
  users: MentionUser[];
  canPost: boolean;
  /** Posts a remark body (raw @[uuid] format). Resolves null on success, an
   *  error message on failure — displayed inline at the composer. */
  onSubmit: (rawBody: string) => Promise<string | null>;
}

export function OfficerUpdates({ updates, users, canPost, onSubmit }: OfficerUpdatesProps) {
  const [draft, setDraft] = useState('');
  const [mentions, setMentions] = useState<Map<string, string>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // userId -> display name, from the picker list + names joined on fetched rows
  const userMap = new Map<string, string>();
  for (const u of users) userMap.set(u.id, u.name);
  for (const u of updates) {
    if (u.author_id && u.author_name && !userMap.has(u.author_id)) {
      userMap.set(u.author_id, u.author_name);
    }
  }

  const handleSubmit = async () => {
    const trimmed = draft.trim();
    if (!trimmed || submitting) return;
    // The textarea caps the DISPLAY draft, but each @Name expands to a 39-char
    // @[uuid] on the wire — pre-check the raw length so a near-limit draft with
    // mentions gets a legible error instead of an opaque server 400.
    const raw = draftToRaw(trimmed, mentions);
    if (raw.length > MAX_RAW_BODY) {
      setError(
        `Update is too long once mentions are expanded (${raw.length}/${MAX_RAW_BODY} characters) — shorten the text.`,
      );
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const failure = await onSubmit(raw);
      if (failure) {
        setError(failure);
      } else {
        setDraft('');
        setMentions(new Map());
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleMentionSelect = useCallback(
    (user: MentionUser, triggerStart: number, queryLength: number) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const before = draft.substring(0, triggerStart);
      const after = draft.substring(triggerStart + 1 + queryLength); // +1 for @
      const displayName = user.name;
      setDraft(`${before}@${displayName} ${after}`);
      setMentions((prev) => {
        const next = new Map(prev);
        next.set(displayName, user.id);
        return next;
      });
      requestAnimationFrame(() => {
        const cursorPos = before.length + displayName.length + 2; // @name + space
        textarea.selectionStart = cursorPos;
        textarea.selectionEnd = cursorPos;
        textarea.focus();
      });
    },
    [draft],
  );

  return (
    <div className={`card-premium p-4 ${canPost ? 'border-l-2 border-l-gold-500/40' : ''}`}>
      <div className="flex items-center gap-2 mb-3">
        <MessageSquarePlus size={14} className="text-gold-500" aria-hidden="true" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-navy-600">
          Officer progress updates ({updates.length})
        </p>
      </div>

      {canPost && (
        <div className="mb-4">
          <div className="relative">
            <MentionAutocomplete users={users} textareaRef={textareaRef} onSelect={handleMentionSelect} />
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="Add a progress update — type @ to mention"
              rows={2}
              maxLength={4000}
              className="w-full px-3 py-2 rounded-lg bg-navy-950 border border-navy-700 text-white text-sm placeholder-navy-600 focus:outline-none focus:border-gold-500/50 focus:ring-1 focus:ring-gold-500/30 resize-none transition-colors"
              aria-label="Progress update"
            />
          </div>
          {error && <p className="text-red-400 text-xs mt-1.5">{error}</p>}
          <div className="flex items-center justify-between mt-1.5">
            <p className="text-[10px] text-navy-600">
              <kbd className="px-1 py-0.5 rounded bg-navy-800 text-slate-400 font-mono">⌘↵</kbd> to post ·
              updates are permanent
            </p>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!draft.trim() || submitting}
              className="btn-gold text-xs !py-1.5 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Post update
            </button>
          </div>
        </div>
      )}

      {updates.length === 0 ? (
        <p className="text-xs text-navy-600 italic">
          No officer updates yet{canPost ? ' — post the first one above.' : '.'}
        </p>
      ) : (
        <ol className="space-y-3">
          {updates.map((u) => (
            <li key={u.id} className="flex items-start gap-2.5">
              <span className="w-6 h-6 rounded-full bg-gold-500/15 text-gold-500 flex items-center justify-center text-[10px] font-semibold shrink-0 mt-0.5">
                {initials(u.author_name)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-xs font-medium text-white">
                    {u.author_name ?? 'Former user'}
                  </span>
                  {u.author_agency && (
                    <span className="text-[10px] text-navy-600">{u.author_agency}</span>
                  )}
                  <span className="text-[10px] text-navy-600">
                    {formatDistanceToNow(parseISO(u.created_at), { addSuffix: true })}
                  </span>
                </div>
                {(u.new_working_status || u.new_target_date || u.target_cleared) && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    {u.new_working_status && (
                      <Badge variant={WORKING_STATUS_VARIANTS[u.new_working_status]}>
                        → {OUTREACH_WORKING_STATUS_LABELS[u.new_working_status]}
                      </Badge>
                    )}
                    {u.new_target_date && (
                      <Badge variant="gold">target: {fmtDate(u.new_target_date)}</Badge>
                    )}
                    {u.target_cleared && <Badge variant="warning">target cleared</Badge>}
                  </div>
                )}
                {u.body && (
                  <p className="text-sm text-slate-200 leading-relaxed mt-0.5 whitespace-pre-wrap break-words">
                    {renderMentionBody(u.body, userMap)}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
