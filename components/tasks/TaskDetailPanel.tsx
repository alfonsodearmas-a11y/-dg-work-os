'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Trash2, Loader2, Plus, Check, Square, CheckSquare, Clock } from 'lucide-react';
import { Task, TaskUpdate, TaskStatus, Subtask, TaskActivity } from '@/lib/task-types';
import { formatDistanceToNow, format, parseISO } from 'date-fns';

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
}

const STATUSES: { value: TaskStatus; label: string; dot: string }[] = [
  { value: 'new', label: 'New', dot: 'bg-indigo-400' },
  { value: 'active', label: 'Active', dot: 'bg-blue-400' },
  { value: 'blocked', label: 'Blocked', dot: 'bg-amber-400' },
  { value: 'done', label: 'Done', dot: 'bg-emerald-400' },
];

const STATUS_PILLS: Record<string, string> = {
  new: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  active: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  blocked: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  done: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
};

const AGENCIES = ['GPL', 'GWI', 'HECI', 'CJIA', 'MARAD', 'GCAA', 'HAS', 'Hinterland', 'Ministry'];
const PRIORITIES = [
  { value: 'critical', label: 'Critical', color: 'text-red-400' },
  { value: 'high', label: 'High', color: 'text-red-400' },
  { value: 'medium', label: 'Medium', color: 'text-amber-400' },
  { value: 'low', label: 'Low', color: 'text-[#64748b]' },
];

const ACTIVITY_LABELS: Record<string, string> = {
  created: 'created this task',
  moved_to_new: 'moved this to New',
  moved_to_active: 'moved this to Active',
  moved_to_blocked: 'moved this to Blocked',
  moved_to_done: 'moved this to Done',
  due_date_changed: 'changed the due date',
  assigned_to: 'reassigned this task',
};

export function TaskDetailPanel({ task, isOpen, isMobile, onClose, onUpdate, onDelete, users }: TaskDetailPanelProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [descValue, setDescValue] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Status dropdown
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  // Detail dropdowns
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const [showAgencyDropdown, setShowAgencyDropdown] = useState(false);
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);

  // Subtasks
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [addingSubtask, setAddingSubtask] = useState(false);

  // Activity
  const [activities, setActivities] = useState<TaskActivity[]>([]);

  const titleRef = useRef<HTMLTextAreaElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const panelDialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (task) {
      setTitleValue(task.title);
      setDescValue(task.description || '');
      setConfirmingDelete(false);
      setEditingTitle(false);
      setEditingDesc(false);
      setShowStatusDropdown(false);
      setShowPriorityDropdown(false);
      setShowAgencyDropdown(false);
      setShowAssigneeDropdown(false);
      // Fetch subtasks and activity
      fetchSubtasks(task.id);
      fetchActivity(task.id);
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

  const handleTitleBlur = () => {
    setEditingTitle(false);
    if (task && titleValue !== task.title && titleValue.trim()) {
      handleInlineUpdate({ title: titleValue }, 'title');
    }
  };

  const handleDescBlur = () => {
    setEditingDesc(false);
    if (task) {
      const newDesc = descValue.trim() || undefined;
      if (newDesc !== (task.description || undefined)) {
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
  const statusPill = STATUS_PILLS[task.status] || STATUS_PILLS.new;
  const completedSubtasks = subtasks.filter(s => s.done).length;

  const panelContent = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-[#2d3a52] shrink-0">
        <div className="flex-1 min-w-0 pr-2">
          {editingTitle ? (
            <textarea
              ref={titleRef}
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleTitleBlur(); } }}
              autoFocus
              aria-label="Task title"
              className="w-full bg-transparent text-white text-lg font-semibold leading-snug resize-none border-b border-[#d4af37]/50 focus:outline-none"
              rows={2}
              style={{ ...inputStyle, overflow: 'hidden' }}
            />
          ) : (
            <h2
              id="task-detail-panel-title"
              className="text-lg font-semibold text-white leading-snug cursor-pointer hover:text-[#d4af37] transition-colors"
              onClick={() => { setEditingTitle(true); setTimeout(() => titleRef.current?.focus(), 0); }}
            >
              {task.title}
            </h2>
          )}
          {/* Status pill */}
          <div className="relative mt-2">
            <button
              onClick={() => setShowStatusDropdown(!showStatusDropdown)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border capitalize transition-colors ${statusPill}`}
              style={{ touchAction: 'manipulation' }}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${STATUSES.find(s => s.value === task.status)?.dot || ''}`} />
              {task.status}
            </button>
            {showStatusDropdown && (
              <div className="absolute top-full left-0 mt-1 z-20 rounded-xl bg-[#142238] border border-[#2d3a52] shadow-xl py-1 min-w-[140px]">
                {STATUSES.map(s => (
                  <button
                    key={s.value}
                    onClick={() => {
                      setShowStatusDropdown(false);
                      if (s.value !== task.status) {
                        handleInlineUpdate({ status: s.value }, 'status');
                      }
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                      s.value === task.status ? 'text-white bg-[#2d3a52]/60' : 'text-[#e2e8f0] hover:bg-[#1a2744]'
                    }`}
                    style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
                  >
                    <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {savedFlash && (
            <span className="text-xs text-emerald-400 mt-1 inline-block animate-fade-in">Saved</span>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="p-2 rounded-lg text-[#64748b] hover:text-white hover:bg-[#2d3a52] transition-colors shrink-0"
          style={{ minWidth: isMobile ? 44 : undefined, minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        {/* DETAILS section */}
        <div className="p-4 border-b border-[#2d3a52]">
          <h3 className="text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-3">Details</h3>
          <div className="space-y-3">
            {/* Priority */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#64748b] w-20 shrink-0">Priority</span>
              <div className="relative flex-1 text-right">
                <button
                  onClick={() => setShowPriorityDropdown(!showPriorityDropdown)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-sm text-[#e2e8f0] hover:bg-[#2d3a52] transition-colors"
                  style={{ touchAction: 'manipulation' }}
                >
                  {task.priority ? (
                    <span className={`capitalize ${PRIORITIES.find(p => p.value === task.priority)?.color || ''}`}>
                      {task.priority}
                    </span>
                  ) : (
                    <span className="text-[#64748b]">None</span>
                  )}
                </button>
                {showPriorityDropdown && (
                  <div className="absolute top-full right-0 mt-1 z-20 rounded-xl bg-[#142238] border border-[#2d3a52] shadow-xl py-1 min-w-[120px]">
                    {PRIORITIES.map(p => (
                      <button
                        key={p.value}
                        onClick={() => {
                          setShowPriorityDropdown(false);
                          handleInlineUpdate({ priority: p.value as Task['priority'] }, 'priority');
                        }}
                        className="w-full px-3 py-2 text-sm text-left hover:bg-[#1a2744] transition-colors"
                        style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
                      >
                        <span className={p.color}>{p.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Agency */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#64748b] w-20 shrink-0">Agency</span>
              <div className="relative flex-1 text-right">
                <button
                  onClick={() => setShowAgencyDropdown(!showAgencyDropdown)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-sm text-[#e2e8f0] hover:bg-[#2d3a52] transition-colors"
                  style={{ touchAction: 'manipulation' }}
                >
                  {task.agency || <span className="text-[#64748b]">None</span>}
                </button>
                {showAgencyDropdown && (
                  <div className="absolute top-full right-0 mt-1 z-20 rounded-xl bg-[#142238] border border-[#2d3a52] shadow-xl py-1 min-w-[140px] max-h-[240px] overflow-y-auto">
                    <button
                      onClick={() => { setShowAgencyDropdown(false); handleInlineUpdate({ agency: null }, 'agency'); }}
                      className="w-full px-3 py-2 text-sm text-left text-[#64748b] hover:bg-[#1a2744] transition-colors"
                      style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
                    >
                      None
                    </button>
                    {AGENCIES.map(a => (
                      <button
                        key={a}
                        onClick={() => { setShowAgencyDropdown(false); handleInlineUpdate({ agency: a }, 'agency'); }}
                        className="w-full px-3 py-2 text-sm text-left text-[#e2e8f0] hover:bg-[#1a2744] transition-colors"
                        style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Assignee */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#64748b] w-20 shrink-0">Assignee</span>
              <div className="relative flex-1 text-right">
                <button
                  onClick={() => setShowAssigneeDropdown(!showAssigneeDropdown)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-sm text-[#e2e8f0] hover:bg-[#2d3a52] transition-colors"
                  style={{ touchAction: 'manipulation' }}
                >
                  {task.owner_name || <span className="text-[#64748b]">Unassigned</span>}
                </button>
                {showAssigneeDropdown && (
                  <div className="absolute top-full right-0 mt-1 z-20 rounded-xl bg-[#142238] border border-[#2d3a52] shadow-xl py-1 min-w-[180px] max-h-[240px] overflow-y-auto">
                    {users.map(u => (
                      <button
                        key={u.id}
                        onClick={() => { setShowAssigneeDropdown(false); /* can't change assignee via TaskUpdate currently, but show for display */ }}
                        className="w-full px-3 py-2 text-sm text-left text-[#e2e8f0] hover:bg-[#1a2744] transition-colors"
                        style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
                      >
                        {u.name}
                        {u.agency && <span className="text-xs text-[#64748b] ml-1">({u.agency})</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Due Date */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#64748b] w-20 shrink-0">Due Date</span>
              <input
                type="date"
                value={task.due_date?.split('T')[0] || ''}
                onChange={(e) => handleInlineUpdate({ due_date: e.target.value || null }, 'due_date')}
                aria-label="Due date"
                className="bg-transparent text-sm text-[#e2e8f0] px-2 py-1 rounded hover:bg-[#2d3a52] transition-colors border-none focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50 cursor-pointer"
                style={inputStyle}
              />
            </div>

            {/* Created */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#64748b] w-20 shrink-0">Created</span>
              <span className="text-xs text-[#94a3b8]">
                {format(parseISO(task.created_at), 'MMM d')}
                {task.owner_name && <span className="text-[#64748b]"> by {task.owner_name.split(' ')[0]}</span>}
              </span>
            </div>
          </div>
        </div>

        {/* DESCRIPTION section */}
        <div className="p-4 border-b border-[#2d3a52]">
          <h3 className="text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-3">Description</h3>
          {editingDesc ? (
            <textarea
              ref={descRef}
              value={descValue}
              onChange={(e) => setDescValue(e.target.value)}
              onBlur={handleDescBlur}
              autoFocus
              rows={4}
              aria-label="Task description"
              className="w-full px-3 py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white text-sm placeholder-[#64748b] focus:outline-none focus:border-[#d4af37] resize-none"
              style={{ ...inputStyle, minHeight: 80 }}
              placeholder="Add a description..."
            />
          ) : (
            <div
              onClick={() => { setEditingDesc(true); setDescValue(task.description || ''); }}
              className="px-3 py-2 rounded-lg text-sm cursor-pointer hover:bg-[#0a1628] transition-colors min-h-[40px]"
            >
              {task.description ? (
                <p className="text-[#e2e8f0] whitespace-pre-wrap leading-relaxed">{task.description}</p>
              ) : (
                <p className="text-[#64748b] italic">Add a description...</p>
              )}
            </div>
          )}
        </div>

        {/* SUBTASKS section */}
        <div className="p-4 border-b border-[#2d3a52]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-[#64748b] uppercase tracking-wider">
              Subtasks
              {subtasks.length > 0 && (
                <span className="ml-1.5 text-[#94a3b8]">
                  {completedSubtasks}/{subtasks.length}
                </span>
              )}
            </h3>
          </div>

          {/* Progress bar */}
          {subtasks.length > 0 && (
            <div className="w-full h-1 rounded-full bg-[#2d3a52] mb-3">
              <div
                className="h-1 rounded-full bg-emerald-500 transition-all"
                style={{ width: `${(completedSubtasks / subtasks.length) * 100}%` }}
              />
            </div>
          )}

          <div className="space-y-1">
            {subtasks.map((st) => (
              <div key={st.id} className="group flex items-center gap-2 py-1.5 px-1 rounded hover:bg-[#0a1628] transition-colors">
                <button
                  onClick={() => handleToggleSubtask(st)}
                  className="shrink-0 text-[#64748b] hover:text-[#d4af37] transition-colors"
                  style={{ minWidth: isMobile ? 44 : undefined, minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
                  aria-label={st.done ? 'Mark subtask incomplete' : 'Mark subtask complete'}
                >
                  {st.done ? (
                    <CheckSquare className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                </button>
                <span className={`flex-1 text-sm ${st.done ? 'line-through text-[#64748b]' : 'text-[#e2e8f0]'}`}>
                  {st.title}
                </span>
                <button
                  onClick={() => handleDeleteSubtask(st.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-[#64748b] hover:text-red-400 transition-all"
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
              className="flex-1 px-3 py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white text-sm placeholder-[#64748b] focus:outline-none focus:border-[#d4af37]"
              style={inputStyle}
            />
            <button
              onClick={handleAddSubtask}
              disabled={!newSubtaskTitle.trim() || addingSubtask}
              className="p-2 rounded-lg bg-[#2d3a52] text-[#94a3b8] hover:text-white hover:bg-[#3d4a62] transition-colors disabled:opacity-50"
              style={{ minWidth: isMobile ? 44 : undefined, minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
              aria-label="Add subtask"
            >
              {addingSubtask ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* ACTIVITY section */}
        <div className="p-4">
          <h3 className="text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-3">Activity</h3>
          <div className="space-y-3">
            {activities.map((a) => (
              <div key={a.id} className="flex items-start gap-2">
                <div className="w-5 h-5 rounded-full bg-[#2d3a52] flex items-center justify-center shrink-0 mt-0.5">
                  <Clock className="h-3 w-3 text-[#64748b]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[#e2e8f0]">
                    <span className="font-medium">{a.user_name || 'System'}</span>{' '}
                    <span className="text-[#94a3b8]">{ACTIVITY_LABELS[a.action] || a.action}</span>
                  </p>
                  <p className="text-xs text-[#64748b] mt-0.5">
                    {formatDistanceToNow(parseISO(a.created_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))}
            {activities.length === 0 && (
              <p className="text-xs text-[#64748b] italic">No activity yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Footer — delete */}
      <div className="shrink-0 p-4 border-t border-[#2d3a52]" style={isMobile ? { paddingBottom: 'max(16px, env(safe-area-inset-bottom))' } : undefined}>
        {confirmingDelete ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-white">Delete this task permanently?</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmingDelete(false)}
                className="flex-1 px-3 py-2.5 rounded-lg text-sm text-[#94a3b8] hover:text-white hover:bg-[#2d3a52] transition-colors"
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
          <button
            onClick={() => setConfirmingDelete(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors"
            style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
          >
            <Trash2 className="h-4 w-4" />
            Delete task
          </button>
        )}
      </div>
    </div>
  );

  // Mobile: full-screen bottom sheet
  if (isMobile) {
    return (
      <div ref={panelDialogRef} role="dialog" aria-modal="true" aria-labelledby="task-detail-panel-title" className="fixed inset-0 z-50 flex flex-col bg-[#0a1628]">
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
      <div ref={panelDialogRef} role="dialog" aria-modal="true" aria-labelledby="task-detail-panel-title" className="fixed top-0 right-0 bottom-0 z-50 w-[380px] bg-gradient-to-b from-[#1a2744] to-[#0f1d32] border-l border-[#2d3a52] shadow-2xl flex flex-col animate-slide-in-right">
        {panelContent}
      </div>
    </>
  );
}
