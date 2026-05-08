'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, UserMinus, Users } from 'lucide-react';

interface Watcher {
  user_id: string;
  name: string | null;
  email: string;
  agency: string | null;
  added_at: string;
  added_by_user_id: string | null;
}

interface Props {
  taskId: string;
  /** Current viewing user — drives the "Stop watching" affordance. */
  currentUserId: string;
  /** When true, the user can remove any watcher (owner/assigner/DG). */
  canManage: boolean;
}

/**
 * Renders the watcher list for a task with a "Stop watching" / "Remove"
 * affordance. Wired into both TaskDetailPanel (desktop) and
 * TaskBottomSheet (mobile).
 */
export function TaskWatchersSection({ taskId, currentUserId, canManage }: Props) {
  const [watchers, setWatchers] = useState<Watcher[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/watchers`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { watchers: Watcher[] };
      setWatchers(body.watchers ?? []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(userId: string) {
    setRemoving(userId);
    try {
      const res = await fetch(`/api/tasks/${taskId}/watchers/${userId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setWatchers((current) =>
        current ? current.filter((w) => w.user_id !== userId) : current,
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to remove watcher');
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Users className="h-3.5 w-3.5 text-navy-600" aria-hidden="true" />
        <p className="text-[11px] uppercase tracking-wider text-navy-600">Watchers</p>
        {watchers ? (
          <span className="text-[11px] text-navy-600 tabular-nums">{watchers.length}</span>
        ) : null}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-navy-600 py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading watchers…
        </div>
      ) : error ? (
        <div className="text-xs text-red-400">{error}</div>
      ) : !watchers || watchers.length === 0 ? (
        <p className="text-xs text-navy-600 py-1">No watchers</p>
      ) : (
        <ul className="space-y-1">
          {watchers.map((w) => {
            const isMe = w.user_id === currentUserId;
            const showRemove = isMe || canManage;
            return (
              <li
                key={w.user_id}
                className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-navy-950/50 border border-navy-800/60 text-xs"
              >
                <div className="min-w-0">
                  <p className="text-white truncate">{w.name || w.email}</p>
                  {w.agency ? (
                    <p className="text-[10px] text-navy-600">{w.agency}</p>
                  ) : null}
                </div>
                {showRemove ? (
                  <button
                    type="button"
                    onClick={() => remove(w.user_id)}
                    disabled={removing === w.user_id}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] text-slate-400 hover:text-red-400 hover:bg-navy-800 transition-colors disabled:opacity-50"
                  >
                    {removing === w.user_id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <UserMinus className="h-3 w-3" />
                    )}
                    {isMe ? 'Stop watching' : 'Remove'}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
