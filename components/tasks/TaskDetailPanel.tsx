'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Trash2, Loader2, Plus, X, Square, CheckSquare, FileSignature } from 'lucide-react';
import { EscalateModal } from '@/components/today/EscalateModal';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Task, TaskUpdate, Subtask, TaskActivity } from '@/lib/task-types';
import { TaskComments } from './TaskComments';
import { TaskHeader } from './TaskHeader';
import { TaskMetadata } from './TaskMetadata';
import { TaskActivityLog } from './TaskActivityLog';
import { TaskWatchersSection } from './TaskWatchersSection';
import { canManageWatchers } from '@/lib/tasks/permissions';
import { CompleteDialog } from '@/components/action-items/CompleteDialog';

interface UserOption {
  id: string;
  name: string;
  role: string;
  agency: string | null;
}

interface TaskDetailPanelProps {
  task: Task | null;
  isOpen: boolean;
  isMobile: boolean;
  onClose: () => void;
  onUpdate: (taskId: string, updates: TaskUpdate) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
  users: UserOption[];
  focusCommentId?: string;
}

export function TaskDetailPanel({ task, isOpen, isMobile, onClose, onUpdate, onDelete, users, focusCommentId }: TaskDetailPanelProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [descValue, setDescValue] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [escalateOpen, setEscalateOpen] = useState(false);

  const { data: session } = useSession();
  const router = useRouter();

  const isOwner = !!task && session?.user?.id === task.owner_user_id;
  const canMarkComplete =
    isOwner && task && (['new', 'active', 'blocked'] as const).includes(task.status as 'new' | 'active' | 'blocked');

  // Consolidated dropdown state: only one dropdown open at a time
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Subtasks
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [addingSubtask, setAddingSubtask] = useState(false);

  // Activity
  const [activities, setActivities] = useState<TaskActivity[]>([]);

  // Meeting title for source provenance (W23)
  const [meetingTitle, setMeetingTitle] = useState<string | null>(null);

  const descRef = useRef<HTMLTextAreaElement>(null);
  const panelDialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (task) {
      setTitleValue(task.title);
      setDescValue(task.description || '');
      setConfirmingDelete(false);
      setEditingTitle(false);
      setEditingDesc(false);
      setOpenDropdown(null);
      setMeetingTitle(null);
      // Fetch subtasks and activity
      fetchSubtasks(task.id);
      fetchActivity(task.id);
      // Resolve source meeting title for the provenance badge (W23)
      if (task.source === 'extraction' && task.source_meeting_id) {
        const mid = task.source_meeting_id;
        fetch(`/api/meetings/${encodeURIComponent(mid)}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data?.meeting?.title) setMeetingTitle(data.meeting.title);
          })
          .catch(() => { /* best-effort — fall back to ULID display */ });
      }
    }
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !panelDialogRef.current) return;
    const focusable = panelDialogRef.current.querySelector<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
    focusable?.focus();
  }, [isOpen]);

  const fetchSubtasks = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/subtasks`);
      const data = await res.json();
      if (data.subtasks) setSubtasks(data.subtasks);
    } catch { setSubtasks([]); }
  };

  const fetchActivity = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/activity`);
      const data = await res.json();
      if (data.activities) setActivities(data.activities);
    } catch { setActivities([]); }
  };

  const flash = (field: string) => {
    setSavedFlash(field);
    setTimeout(() => setSavedFlash(''), 1500);
  };

  const handleInlineUpdate = useCallback(async (updates: TaskUpdate, field: string) => {
    if (!task) return;
    setSaving(true);
    try {
      await onUpdate(task.id, updates);
      flash(field);
    } finally {
      setSaving(false);
    }
  }, [task, onUpdate]);

  const handleDescBlur = () => {
    setEditingDesc(false);
    if (task) {
      const trimmed = descValue.trim();
      const newDesc = trimmed || null;
      if (newDesc !== (task.description || null)) {
        handleInlineUpdate({ description: newDesc }, 'description');
      }
    }
  };

  const handleAddSubtask = async () => {
    if (!task || !newSubtaskTitle.trim()) return;
    setAddingSubtask(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/subtasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newSubtaskTitle }),
      });
      const data = await res.json();
      if (data.subtask) {
        setSubtasks(prev => [...prev, data.subtask]);
        setNewSubtaskTitle('');
      }
    } finally {
      setAddingSubtask(false);
    }
  };

  const handleToggleSubtask = async (subtask: Subtask) => {
    if (!task) return;
    setSubtasks(prev => prev.map(s => s.id === subtask.id ? { ...s, done: !s.done } : s));
    try {
      await fetch(`/api/tasks/${task.id}/subtasks`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtaskId: subtask.id, done: !subtask.done }),
      });
    } catch {
      setSubtasks(prev => prev.map(s => s.id === subtask.id ? { ...s, done: subtask.done } : s));
    }
  };

  const handleDeleteSubtask = async (subtaskId: string) => {
    if (!task) return;
    setSubtasks(prev => prev.filter(s => s.id !== subtaskId));
    try {
      await fetch(`/api/tasks/${task.id}/subtasks`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtaskId }),
      });
    } catch {
      fetchSubtasks(task.id);
    }
  };

  const handleDelete = async () => {
    if (!task) return;
    setDeleting(true);
    try {
      await onDelete(task.id);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  if (!isOpen || !task) return null;

  const inputStyle: React.CSSProperties = isMobile ? { minHeight: 44, fontSize: 16 } : {};
  const completedSubtasks = subtasks.filter(s => s.done).length;

  const panelContent = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <TaskHeader
        task={task}
        isMobile={isMobile}
        editingTitle={editingTitle}
        titleValue={titleValue}
        savedFlash={savedFlash}
        openDropdown={openDropdown}
        meetingTitle={meetingTitle}
        onEditingTitleChange={setEditingTitle}
        onTitleValueChange={setTitleValue}
        onOpenDropdownChange={setOpenDropdown}
        onInlineUpdate={handleInlineUpdate}
        onClose={onClose}
      />

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        {/* Minister attention strip — badge + role-aware actions */}
        <MinisterAttentionStrip
          task={task}
          userRole={session?.user?.role ?? ''}
          onRefer={() => setEscalateOpen(true)}
          onChanged={() => router.refresh()}
        />

        {/* DETAILS section */}
        <TaskMetadata
          task={task}
          isMobile={isMobile}
          users={users}
          openDropdown={openDropdown}
          onOpenDropdownChange={setOpenDropdown}
          onInlineUpdate={handleInlineUpdate}
        />

        {/* DESCRIPTION section */}
        <div className="p-4 border-b border-navy-800">
          <h3 className="text-xs font-semibold text-navy-600 uppercase tracking-wider mb-3">Description</h3>
          {editingDesc ? (
            <textarea
              ref={descRef}
              value={descValue}
              onChange={(e) => setDescValue(e.target.value)}
              onBlur={handleDescBlur}
              autoFocus
              rows={4}
              aria-label="Task description"
              className="w-full px-3 py-2 rounded-lg bg-navy-950 border border-navy-800 text-white text-sm placeholder-navy-600 focus:outline-none focus:border-gold-500 resize-none"
              style={{ ...inputStyle, minHeight: 80 }}
              placeholder="Add a description..."
            />
          ) : (
            <div
              onClick={() => { setEditingDesc(true); setDescValue(task.description || ''); }}
              className="px-3 py-2 rounded-lg text-sm cursor-pointer hover:bg-navy-950 transition-colors min-h-[40px]"
            >
              {task.description ? (
                <p className="text-slate-200 whitespace-pre-wrap leading-relaxed">{task.description}</p>
              ) : (
                <p className="text-navy-600 italic">Add a description...</p>
              )}
            </div>
          )}
        </div>

        {/* SUBTASKS section */}
        <div className="p-4 border-b border-navy-800">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-navy-600 uppercase tracking-wider">
              Subtasks
              {subtasks.length > 0 && (
                <span className="ml-1.5 text-slate-400">
                  {completedSubtasks}/{subtasks.length}
                </span>
              )}
            </h3>
          </div>

          {/* Progress bar */}
          {subtasks.length > 0 && (
            <div className="w-full h-1 rounded-full bg-navy-800 mb-3">
              <div
                className="h-1 rounded-full bg-emerald-500 transition-all"
                style={{ width: `${(completedSubtasks / subtasks.length) * 100}%` }}
              />
            </div>
          )}

          <div className="space-y-1">
            {subtasks.map((st) => (
              <div key={st.id} className="group flex items-center gap-2 py-1.5 px-1 rounded hover:bg-navy-950 transition-colors">
                <button
                  onClick={() => handleToggleSubtask(st)}
                  className="shrink-0 text-navy-600 hover:text-gold-500 transition-colors"
                  style={{ minWidth: isMobile ? 44 : undefined, minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
                  aria-label={st.done ? 'Mark subtask incomplete' : 'Mark subtask complete'}
                >
                  {st.done ? (
                    <CheckSquare className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                </button>
                <span className={`flex-1 text-sm ${st.done ? 'line-through text-navy-600' : 'text-slate-200'}`}>
                  {st.title}
                </span>
                <button
                  onClick={() => handleDeleteSubtask(st.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-navy-600 hover:text-red-400 transition-all"
                  aria-label="Delete subtask"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          {/* Add subtask */}
          <div className="flex items-center gap-2 mt-2">
            <input
              type="text"
              value={newSubtaskTitle}
              onChange={(e) => setNewSubtaskTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddSubtask(); }}
              placeholder="Add subtask..."
              aria-label="New subtask title"
              className="flex-1 px-3 py-2 rounded-lg bg-navy-950 border border-navy-800 text-white text-sm placeholder-navy-600 focus:outline-none focus:border-gold-500"
              style={inputStyle}
            />
            <button
              onClick={handleAddSubtask}
              disabled={!newSubtaskTitle.trim() || addingSubtask}
              className="p-2 rounded-lg bg-navy-800 text-slate-400 hover:text-white hover:bg-[#3d4a62] transition-colors disabled:opacity-50"
              style={{ minWidth: isMobile ? 44 : undefined, minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
              aria-label="Add subtask"
            >
              {addingSubtask ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* WATCHERS section */}
        <div className="px-4 py-3 border-b border-navy-800">
          <TaskWatchersSection
            taskId={task.id}
            currentUserId={session?.user?.id ?? ''}
            canManage={canManageWatchers(task, session)}
          />
        </div>

        {/* COMMENTS section */}
        <div className="border-b border-navy-800">
          <TaskComments taskId={task.id} users={users} focusCommentId={focusCommentId} />
        </div>

        {/* ACTIVITY section */}
        <TaskActivityLog activities={activities} />
      </div>

      {/* Footer — actions */}
      <div className="shrink-0 p-4 border-t border-navy-800" style={isMobile ? { paddingBottom: 'max(16px, env(safe-area-inset-bottom))' } : undefined}>
        {confirmingDelete ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-white">Delete this task permanently?</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmingDelete(false)}
                className="flex-1 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-navy-800 transition-colors"
                style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm text-red-400 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
              >
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                Yes, delete
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {canMarkComplete && (
              <button
                type="button"
                onClick={() => setCompleteOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-gold-500 text-navy-950 rounded-lg hover:bg-gold-500/90 transition-colors"
                style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
                aria-label="Mark task complete"
              >
                <CheckSquare className="h-3.5 w-3.5" />
                Mark complete
              </button>
            )}
            <button
              onClick={() => setConfirmingDelete(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors"
              style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
            >
              <Trash2 className="h-4 w-4" />
              Delete task
            </button>
          </div>
        )}
      </div>

      {completeOpen && task && (
        <CompleteDialog
          taskId={task.id}
          onClose={() => setCompleteOpen(false)}
          onDone={() => { setCompleteOpen(false); router.refresh(); }}
        />
      )}
      {task && (
        <EscalateModal
          isOpen={escalateOpen}
          onClose={() => setEscalateOpen(false)}
          sourceType="task"
          sourceId={task.id}
          preFillTitle={task.title}
          preFillAgency={task.agency ? task.agency.toUpperCase() : null}
        />
      )}
    </div>
  );

  // Mobile: full-screen bottom sheet
  if (isMobile) {
    return (
      <div ref={panelDialogRef} role="dialog" aria-modal="true" aria-labelledby="task-detail-panel-title" className="fixed inset-0 z-50 flex flex-col bg-navy-950">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>
        {panelContent}
      </div>
    );
  }

  // Desktop: side panel
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div ref={panelDialogRef} role="dialog" aria-modal="true" aria-labelledby="task-detail-panel-title" className="fixed top-0 right-0 bottom-0 z-50 w-[380px] bg-gradient-to-b from-[#1a2744] to-[#0f1d32] border-l border-navy-800 shadow-2xl flex flex-col animate-slide-in-right">
        {panelContent}
      </div>
    </>
  );
}

interface MinisterAttentionStripProps {
  task: Task;
  userRole: string;
  onRefer: () => void;
  onChanged: () => void;
}

function MinisterAttentionStrip({ task, userRole, onRefer, onChanged }: MinisterAttentionStripProps) {
  const [busy, setBusy] = useState(false);
  const isDG = userRole === 'dg';
  const isMinister = userRole === 'minister';
  const isFlagged = task.requires_minister_attention && !task.minister_closed_at;
  const isSeen = !!task.minister_seen_at;

  async function call(url: string, method: 'POST' | 'PATCH', body?: unknown) {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? 'Action failed');
        return;
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-3 md:px-6 pt-3 flex flex-wrap items-center justify-end gap-2">
      {isFlagged && (
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-gold-500/15 text-gold-300 border border-gold-500/40">
          <FileSignature size={10} aria-hidden="true" />
          Referred to Minister
          {isSeen && <span className="text-emerald-300/80">· Seen</span>}
        </span>
      )}

      {isDG && !isFlagged && (
        <button
          type="button"
          onClick={onRefer}
          className="btn-navy text-xs flex items-center gap-2"
          disabled={busy}
        >
          <FileSignature size={12} aria-hidden="true" /> Refer to Minister
        </button>
      )}

      {isDG && isFlagged && (
        <button
          type="button"
          onClick={() => call(`/api/tasks/${task.id}`, 'PATCH', { requires_minister_attention: false })}
          className="text-xs text-navy-400 hover:text-white px-3 py-1.5 border border-navy-800 rounded-lg"
          disabled={busy}
        >
          Unflag
        </button>
      )}

      {isMinister && isFlagged && !isSeen && (
        <button
          type="button"
          onClick={() => call(`/api/tasks/${task.id}/minister/acknowledge`, 'POST')}
          className="btn-gold text-xs"
          disabled={busy}
        >
          Acknowledge
        </button>
      )}

      {isMinister && isFlagged && (
        <button
          type="button"
          onClick={() => call(`/api/tasks/${task.id}/minister/close`, 'POST')}
          className="text-xs text-navy-400 hover:text-white px-3 py-1.5 border border-navy-800 rounded-lg"
          disabled={busy}
        >
          Close for Minister
        </button>
      )}
    </div>
  );
}
