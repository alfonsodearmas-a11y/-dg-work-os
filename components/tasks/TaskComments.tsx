'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Send, Loader2, MessageSquare } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { MentionAutocomplete, type MentionUser } from './MentionAutocomplete';

interface Comment {
  id: string;
  task_id: string;
  user_id: string;
  body: string;
  parent_id: string | null;
  user_name: string;
  user_role: string;
  created_at: string;
}

interface TaskCommentsProps {
  taskId: string;
  users: MentionUser[];
}

// Map of userId -> display name built from users prop + fetched comments
type UserMap = Map<string, string>;

/** Parse @[userId] tokens and render with highlighted names */
function renderCommentBody(body: string, userMap: UserMap) {
  const parts: (string | { userId: string; name: string })[] = [];
  const regex = /@\[([0-9a-f-]{36})\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(body)) !== null) {
    if (match.index > lastIndex) {
      parts.push(body.substring(lastIndex, match.index));
    }
    const userId = match[1];
    parts.push({ userId, name: userMap.get(userId) || 'Unknown' });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < body.length) {
    parts.push(body.substring(lastIndex));
  }

  return (
    <span>
      {parts.map((part, i) =>
        typeof part === 'string' ? (
          <span key={i}>{part}</span>
        ) : (
          <span key={i} className="text-gold-500 font-medium">
            @{part.name}
          </span>
        )
      )}
    </span>
  );
}

/** Extract all @[userId] tokens from raw text */
function extractMentionIds(text: string): string[] {
  const ids: string[] = [];
  const regex = /@\[([0-9a-f-]{36})\]/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (!ids.includes(match[1])) ids.push(match[1]);
  }
  return ids;
}

export function TaskComments({ taskId, users }: TaskCommentsProps) {
  const { data: session } = useSession();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState('');

  // Track mentions inserted in the current draft: maps display text position to userId
  const [mentions, setMentions] = useState<Map<string, string>>(new Map());

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Build user map for rendering mention tokens
  const userMap: UserMap = new Map();
  for (const u of users) {
    userMap.set(u.id, u.name);
  }
  // Also add names from fetched comments (in case a user was deactivated)
  for (const c of comments) {
    if (!userMap.has(c.user_id)) {
      userMap.set(c.user_id, c.user_name);
    }
  }

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments`);
      const json = await res.json();
      if (json.success && json.data) {
        setComments(json.data);
      } else {
        console.warn('[TaskComments] Failed to fetch comments:', json.error || res.status);
      }
    } catch (err) {
      console.error('[TaskComments] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    setComments([]);
    setLoading(true);
    setDraft('');
    setMentions(new Map());
    fetchComments();
  }, [taskId, fetchComments]);

  // Auto-scroll when new comments arrive
  useEffect(() => {
    if (commentsEndRef.current && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
      if (isNearBottom) {
        commentsEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [comments.length]);

  // Convert draft text (with @DisplayName) to raw text (with @[userId])
  const draftToRaw = useCallback(
    (text: string): string => {
      let raw = text;
      // Sort mentions by name length desc to avoid partial replacements
      const sorted = Array.from(mentions.entries()).sort(
        ([a], [b]) => b.length - a.length
      );
      for (const [displayName, userId] of sorted) {
        // Replace @DisplayName with @[userId]
        raw = raw.replaceAll(`@${displayName}`, `@[${userId}]`);
      }
      return raw;
    },
    [mentions]
  );

  const handleSubmit = async () => {
    const trimmed = draft.trim();
    if (!trimmed || submitting) return;

    const rawBody = draftToRaw(trimmed);
    const mentionedUserIds = extractMentionIds(rawBody);

    setSubmitting(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: rawBody }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setComments((prev) => [...prev, json.data]);
        setDraft('');
        setMentions(new Map());

        // Fire-and-forget mention notifications
        if (mentionedUserIds.length > 0) {
          fetch('/api/tasks/mention-notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              commentId: json.data.id,
              taskId,
              mentionedUserIds,
            }),
          }).catch(() => {});
        }
      } else {
        console.error('[TaskComments] Failed to post comment:', json.error || json.message || res.status);
      }
    } catch (err) {
      console.error('[TaskComments] Submit error:', err);
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
      const newText = `${before}@${displayName} ${after}`;

      setDraft(newText);
      setMentions((prev) => {
        const next = new Map(prev);
        next.set(displayName, user.id);
        return next;
      });

      // Move cursor after the inserted mention
      requestAnimationFrame(() => {
        if (textarea) {
          const cursorPos = before.length + displayName.length + 2; // @name + space
          textarea.selectionStart = cursorPos;
          textarea.selectionEnd = cursorPos;
          textarea.focus();
        }
      });
    },
    [draft]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl+Enter to submit
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const currentUserId = (session?.user as { id?: string })?.id;

  return (
    <div className="flex flex-col">
      <h3 className="text-xs font-semibold text-navy-600 uppercase tracking-wider mb-3 px-4 pt-4">
        <MessageSquare className="h-3.5 w-3.5 inline-block mr-1.5 -mt-0.5" />
        Comments
        {comments.length > 0 && (
          <span className="ml-1.5 text-slate-400">{comments.length}</span>
        )}
      </h3>

      {/* Comments list */}
      <div
        ref={scrollContainerRef}
        className="px-4 space-y-3 max-h-[240px] overflow-y-auto"
      >
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-navy-600" />
          </div>
        ) : comments.length === 0 ? (
          <p className="text-xs text-navy-600 italic py-2">No comments yet</p>
        ) : (
          comments.map((comment) => {
            const isOwn = comment.user_id === currentUserId;
            return (
              <div key={comment.id} className="flex items-start gap-2.5">
                {/* Avatar */}
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-semibold ${
                    isOwn
                      ? 'bg-gold-500/20 text-gold-500'
                      : 'bg-navy-800 text-slate-400'
                  }`}
                >
                  {comment.user_name
                    .split(' ')
                    .map((w) => w[0])
                    .join('')
                    .substring(0, 2)
                    .toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-medium text-white">
                      {isOwn ? 'You' : comment.user_name}
                    </span>
                    <span className="text-[10px] text-navy-600">
                      {formatDistanceToNow(parseISO(comment.created_at), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                  <p className="text-sm text-slate-200 leading-relaxed mt-0.5 whitespace-pre-wrap break-words">
                    {renderCommentBody(comment.body, userMap)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={commentsEndRef} />
      </div>

      {/* Input area */}
      <div className="px-4 pb-4 pt-3">
        <div className="relative">
          <MentionAutocomplete
            users={users}
            textareaRef={textareaRef}
            onSelect={handleMentionSelect}
          />
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a comment... (@ to mention)"
            rows={2}
            className="w-full px-3 py-2 pr-10 rounded-lg bg-navy-950 border border-navy-800 text-white text-sm placeholder-navy-600 focus:outline-none focus:border-gold-500/50 resize-none transition-colors"
          />
          <button
            onClick={handleSubmit}
            disabled={!draft.trim() || submitting}
            className="absolute right-2 bottom-2.5 p-1.5 rounded-md text-navy-600 hover:text-gold-500 disabled:opacity-30 disabled:hover:text-navy-600 transition-colors"
            aria-label="Send comment"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="text-[10px] text-navy-600 mt-1">
          <kbd className="px-1 py-0.5 rounded bg-navy-800 text-slate-400 font-mono">⌘↵</kbd> to send
        </p>
      </div>
    </div>
  );
}
