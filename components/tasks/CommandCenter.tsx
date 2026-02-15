'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Clock, AlertTriangle, User, CheckCheck, X, Trash2 } from 'lucide-react';
import { ALL_STATUSES, STATUS_CONFIG, type TaskStatus } from '@/lib/task-transitions';

// ── Types ───────────────────────────────────────────────────────────────────

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  agency: string;
  assignee_id: string;
  assignee_name?: string;
  due_date?: string | null;
  created_at: string;
}

interface TeamMember {
  id: string;
  full_name: string;
  role: string;
  agency: string;
}

interface Toast {
  id: number;
  type: 'success' | 'error';
  message: string;
}

const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-yellow-500',
  low: 'bg-green-500',
};

let toastId = 0;

// ── Main Component ──────────────────────────────────────────────────────────

export function CommandCenter() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Touch drag state
  const touchRef = useRef<{ taskId: string; el: HTMLDivElement; startY: number; clone: HTMLDivElement | null } | null>(null);
  // Track toast dismiss timers for cleanup on unmount
  const toastTimerRefs = useRef<Set<NodeJS.Timeout>>(new Set());

  const addToast = useCallback((type: 'success' | 'error', message: string) => {
    const id = ++toastId;
    setToasts(prev => [...prev.slice(-2), { id, type, message }]);
    const timer = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      toastTimerRefs.current.delete(timer);
    }, 3000);
    toastTimerRefs.current.add(timer);
  }, []);

  // Clean up all toast timers on unmount
  useEffect(() => {
    return () => {
      toastTimerRefs.current.forEach(clearTimeout);
    };
  }, []);

  // ── Fetch tasks + team ──────────────────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/tm/tasks?limit=200');
      const data = await res.json();
      if (data.success) setTasks(data.data.tasks);
    } catch {
      console.error('Failed to fetch tasks');
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  useEffect(() => {
    fetch('/api/admin/users')
      .then(r => r.json())
      .then(d => {
        if (d.success) setTeam(d.data.filter((u: any) => u.is_active));
      })
      .catch(() => {});
  }, []);

  // ── Status change (shared by DnD + dropdown) ───────────────────────────
  const handleStatusChange = useCallback(async (taskId: string, newStatus: TaskStatus) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.status === newStatus) return;
    const oldStatus = task.status;

    // Optimistic
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));

    try {
      const res = await fetch(`/api/tm/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!data.success) {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: oldStatus } : t));
        addToast('error', data.error || 'Failed to update');
        return;
      }
      addToast('success', `Moved to ${STATUS_CONFIG[newStatus].label}`);
    } catch {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: oldStatus } : t));
      addToast('error', 'Network error — reverted');
    }
  }, [tasks, addToast]);

  // ── HTML5 Drag handlers ─────────────────────────────────────────────────
  const onDragStart = useCallback((e: React.DragEvent, taskId: string) => {
    setDragTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
    // Make dragged card semi-transparent
    requestAnimationFrame(() => {
      const el = e.target as HTMLElement;
      el.style.opacity = '0.4';
    });
  }, []);

  const onDragEnd = useCallback((e: React.DragEvent) => {
    (e.target as HTMLElement).style.opacity = '1';
    setDragTaskId(null);
    setDragOverCol(null);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent, status: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCol(status);
  }, []);

  const onDragLeave = useCallback(() => {
    setDragOverCol(null);
  }, []);

  const onDrop = useCallback((e: React.DragEvent, targetStatus: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    setDragTaskId(null);
    setDragOverCol(null);
    if (taskId) handleStatusChange(taskId, targetStatus as TaskStatus);
  }, [handleStatusChange]);

  // ── Touch drag handlers ─────────────────────────────────────────────────
  const onTouchStart = useCallback((e: React.TouchEvent, taskId: string) => {
    const touch = e.touches[0];
    const el = e.currentTarget as HTMLDivElement;
    // Create visual clone
    const clone = el.cloneNode(true) as HTMLDivElement;
    clone.style.position = 'fixed';
    clone.style.left = `${touch.clientX - 80}px`;
    clone.style.top = `${touch.clientY - 30}px`;
    clone.style.width = `${el.offsetWidth}px`;
    clone.style.opacity = '0.85';
    clone.style.transform = 'rotate(2deg) scale(1.05)';
    clone.style.zIndex = '9999';
    clone.style.pointerEvents = 'none';
    document.body.appendChild(clone);
    el.style.opacity = '0.3';
    touchRef.current = { taskId, el, startY: touch.clientY, clone };
    setDragTaskId(taskId);
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchRef.current?.clone) return;
    const touch = e.touches[0];
    touchRef.current.clone.style.left = `${touch.clientX - 80}px`;
    touchRef.current.clone.style.top = `${touch.clientY - 30}px`;
    // Detect which column we're over
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const col = el?.closest('[data-status]');
    setDragOverCol(col?.getAttribute('data-status') || null);
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!touchRef.current) return;
    const { taskId, el, clone } = touchRef.current;
    if (clone) {
      clone.remove();
    }
    el.style.opacity = '1';
    if (dragOverCol && dragOverCol !== tasks.find(t => t.id === taskId)?.status) {
      handleStatusChange(taskId, dragOverCol as TaskStatus);
    }
    touchRef.current = null;
    setDragTaskId(null);
    setDragOverCol(null);
  }, [dragOverCol, tasks, handleStatusChange]);

  // ── Task creation ───────────────────────────────────────────────────────
  const handleCreate = useCallback(async (data: { title: string; description: string; assignee_id: string; due_date: string; priority: string }) => {
    try {
      const res = await fetch('/api/tm/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!result.success) {
        addToast('error', result.error || 'Failed to create task');
        return;
      }
      // Refetch to get joined fields
      fetchTasks();
      setShowCreate(false);
      addToast('success', 'Task created');
    } catch {
      addToast('error', 'Network error');
    }
  }, [addToast, fetchTasks]);

  // ── Delete task ────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (taskId: string) => {
    // Optimistic removal
    const prev = tasks;
    setTasks(t => t.filter(x => x.id !== taskId));

    try {
      const res = await fetch(`/api/tm/tasks/${taskId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) {
        setTasks(prev);
        addToast('error', data.error || 'Failed to delete');
        return;
      }
      addToast('success', 'Task deleted');
    } catch {
      setTasks(prev);
      addToast('error', 'Network error — reverted');
    }
  }, [tasks, addToast]);

  // ── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Inline create form */}
      {showCreate ? (
        <CreateTaskForm team={team} onSubmit={handleCreate} onCancel={() => setShowCreate(false)} />
      ) : (
        <button
          onClick={() => setShowCreate(true)}
          className="btn-gold flex items-center gap-2 px-4 py-2.5 text-sm"
        >
          <Plus className="h-4 w-4" /> New Task
        </button>
      )}

      {/* Kanban board — 4 columns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {ALL_STATUSES.map(status => {
          const config = STATUS_CONFIG[status];
          const colTasks = tasks.filter(t => t.status === status);
          const isOver = dragOverCol === status;
          const isDragging = dragTaskId !== null;

          return (
            <div
              key={status}
              data-status={status}
              onDragOver={(e) => onDragOver(e, status)}
              onDragLeave={onDragLeave}
              onDrop={(e) => onDrop(e, status)}
              className={`rounded-xl border-t-2 min-h-[200px] transition-all duration-150 ${
                isOver
                  ? 'bg-[#d4af37]/10 ring-2 ring-[#d4af37] border-t-[#d4af37]'
                  : isDragging
                    ? 'bg-[#0f1d32] ring-1 ring-[#d4af37]/20 border-t-[#d4af37]/30'
                    : 'bg-[#0f1d32] border-[#2d3a52]'
              }`}
            >
              {/* Column header */}
              <div className="px-3 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${config.color}`} />
                  <span className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide">{config.label}</span>
                </div>
                <span className="text-xs text-[#64748b] bg-[#1a2744] px-1.5 py-0.5 rounded">{colTasks.length}</span>
              </div>

              {/* Cards */}
              <div className="px-2 pb-2 space-y-2">
                {colTasks.map(t => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    onStatusChange={handleStatusChange}
                    onDelete={handleDelete}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    onTouchStart={onTouchStart}
                    onTouchMove={onTouchMove}
                    onTouchEnd={onTouchEnd}
                    isDragging={dragTaskId === t.id}
                  />
                ))}
                {colTasks.length === 0 && (
                  <p className="text-center text-xs text-[#64748b]/40 py-10">
                    {isOver ? 'Drop here' : 'No tasks'}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Toast */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[999] flex flex-col gap-2">
          {toasts.map(t => (
            <div
              key={t.id}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg border text-xs font-medium animate-slide-up ${
                t.type === 'success'
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : 'bg-red-500/15 text-red-400 border-red-500/30'
              }`}
            >
              {t.type === 'success' ? <CheckCheck className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
              {t.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Task Card ───────────────────────────────────────────────────────────────

function TaskCard({
  task,
  onStatusChange,
  onDelete,
  onDragStart,
  onDragEnd,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  isDragging,
}: {
  task: Task;
  onStatusChange: (id: string, status: TaskStatus) => void;
  onDelete: (id: string) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onTouchStart: (e: React.TouchEvent, id: string) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
  isDragging: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';
  const dot = PRIORITY_DOT[task.priority] || PRIORITY_DOT.medium;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task.id)}
      onDragEnd={onDragEnd}
      onTouchStart={(e) => onTouchStart(e, task.id)}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className={`card-premium p-3 cursor-grab active:cursor-grabbing select-none transition-opacity ${
        isDragging ? 'opacity-40' : ''
      } ${isOverdue ? 'ring-1 ring-red-500/40' : ''}`}
    >
      {/* Title + priority dot */}
      <div className="flex items-start gap-2 mb-2">
        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${dot}`} />
        <h4 className="text-sm font-medium text-white leading-tight line-clamp-2 flex-1">{task.title}</h4>
      </div>

      {/* Assignee + due date */}
      <div className="flex items-center justify-between text-[11px] text-[#64748b] mb-2">
        {task.assignee_name && (
          <span className="flex items-center gap-1 truncate">
            <User className="h-3 w-3" />
            {task.assignee_name}
          </span>
        )}
        {task.due_date && (
          <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-400' : ''}`}>
            {isOverdue ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
            {new Date(task.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </span>
        )}
      </div>

      {/* Status dropdown + delete */}
      <div className="flex items-center gap-1">
        <select
          value={task.status}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => onStatusChange(task.id, e.target.value as TaskStatus)}
          className="flex-1 text-xs bg-[#0a1628] border border-[#2d3a52] text-[#c8d0dc] rounded px-2 py-1 cursor-pointer hover:border-[#d4af37]/40 transition-colors"
        >
          {ALL_STATUSES.map(s => (
            <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
          ))}
        </select>
        {confirmDelete ? (
          <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
            <button
              onClick={() => { onDelete(task.id); setConfirmDelete(false); }}
              className="p-1 rounded text-red-400 bg-red-500/15 hover:bg-red-500/30 transition-colors text-[10px] font-medium"
              title="Confirm delete"
            >
              Yes
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="p-1 rounded text-[#64748b] hover:text-white transition-colors text-[10px]"
              title="Cancel"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
            onMouseDown={(e) => e.stopPropagation()}
            className="p-1 rounded text-[#64748b] hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Delete task"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Create Task Form ────────────────────────────────────────────────────────

function CreateTaskForm({
  team,
  onSubmit,
  onCancel,
}: {
  team: TeamMember[];
  onSubmit: (data: { title: string; description: string; assignee_id: string; due_date: string; priority: string }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('medium');

  const inputCls = 'w-full px-3 py-2 bg-[#0a1628] border border-[#2d3a52] rounded-lg text-sm text-white placeholder:text-[#64748b] focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50';

  return (
    <div className="card-premium p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">New Task</h3>
        <button onClick={onCancel} className="text-[#64748b] hover:text-white text-xs">Cancel</button>
      </div>

      <input
        type="text"
        placeholder="Task title..."
        value={title}
        onChange={e => setTitle(e.target.value)}
        className={inputCls}
        autoFocus
      />

      <textarea
        placeholder="Description (optional)"
        value={description}
        onChange={e => setDescription(e.target.value)}
        rows={2}
        className={`${inputCls} resize-none`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className={inputCls}>
          <option value="">Assign to...</option>
          {team.map(u => (
            <option key={u.id} value={u.id}>{u.full_name}</option>
          ))}
        </select>

        <input
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          className={inputCls}
        />

        <select value={priority} onChange={e => setPriority(e.target.value)} className={inputCls}>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => {
            if (!title.trim() || !assigneeId) return;
            onSubmit({ title, description, assignee_id: assigneeId, due_date: dueDate, priority });
          }}
          disabled={!title.trim() || !assigneeId}
          className="btn-gold flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="h-4 w-4" /> Create
        </button>
      </div>
    </div>
  );
}
