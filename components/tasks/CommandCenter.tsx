'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  LayoutGrid, List, AlertTriangle, Clock,
  CheckCircle, Send, Eye, XCircle, UserCheck,
  CheckCheck, X,
} from 'lucide-react';
import { TaskManagementCard, STATUS_LABELS } from './TaskManagementCard';
import { DraggableTaskCard, DragOverlayCard } from './DraggableTaskCard';
import { DroppableKanbanColumn } from './DroppableKanbanColumn';
import { TaskFilters } from './TaskFilters';
import { useAuth } from '@/lib/hooks/useAuth';
import { getValidTransitions, validateTransition } from '@/lib/task-transitions';
import type { TaskStatus } from '@/lib/task-transitions';

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  agency: string;
  assignee_id: string;
  assignee_name?: string;
  assignee_email?: string;
  creator_name?: string;
  due_date?: string | null;
  created_at: string;
  updated_at: string;
}

interface Stats {
  total_active: string;
  overdue: string;
  awaiting_review: string;
  completed_this_week: string;
}

interface Toast {
  id: number;
  type: 'success' | 'error';
  message: string;
}

const KANBAN_COLUMNS = [
  { status: 'assigned', label: 'Assigned', icon: Send, color: 'border-blue-500/50' },
  { status: 'acknowledged', label: 'Acknowledged', icon: UserCheck, color: 'border-indigo-500/50' },
  { status: 'in_progress', label: 'In Progress', icon: Clock, color: 'border-yellow-500/50' },
  { status: 'submitted', label: 'For Review', icon: Eye, color: 'border-purple-500/50' },
  { status: 'verified', label: 'Verified', icon: CheckCircle, color: 'border-green-500/50' },
  { status: 'rejected', label: 'Rejected', icon: XCircle, color: 'border-red-500/50' },
];

let toastCounter = 0;

export function CommandCenter() {
  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [assignees, setAssignees] = useState<{ id: string; full_name: string }[]>([]);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [apiRole, setApiRole] = useState('');
  const router = useRouter();
  const { user: authUser } = useAuth();

  // Role from multiple sources: API viewer > useAuth > default 'director' (this page is DG-only)
  const userRole = apiRole || authUser?.role || 'director';

  // ── Sensors ──────────────────────────────────────────────────────────────
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 200, tolerance: 8 },
  });
  const sensors = useSensors(pointerSensor, touchSensor);

  // ── Toast ────────────────────────────────────────────────────────────────
  const addToast = useCallback((type: 'success' | 'error', message: string) => {
    const id = ++toastCounter;
    setToasts(prev => [...prev.slice(-2), { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  // ── Data Fetching ────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/tm/tasks/stats');
      const data = await res.json();
      if (data.success) setStats(data.data);
    } catch { /* ignore */ }
  }, []);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '200', ...filters });
    try {
      const [tasksRes, statsRes] = await Promise.all([
        fetch(`/api/tm/tasks?${params}`),
        fetch('/api/tm/tasks/stats'),
      ]);
      const tasksData = await tasksRes.json();
      const statsData = await statsRes.json();
      if (tasksData.success) {
        setTasks(tasksData.data.tasks);
        if (tasksData.viewer?.role) setApiRole(tasksData.viewer.role);
      }
      if (statsData.success) setStats(statsData.data);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    }
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    fetch('/api/admin/users')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setAssignees(d.data.filter((u: any) => u.role === 'ceo').map((u: any) => ({ id: u.id, full_name: u.full_name })));
        }
      })
      .catch(() => {});
  }, []);

  // ── Status Change (shared by DnD + dropdown + table select) ─────────────
  const handleStatusChange = useCallback(async (taskId: string, newStatus: TaskStatus) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const oldStatus = task.status;

    // Client-side validation
    if (!validateTransition(oldStatus as TaskStatus, newStatus, userRole)) {
      addToast('error', `Cannot move from ${oldStatus.replace('_', ' ')} to ${newStatus.replace('_', ' ')}`);
      return;
    }

    // Optimistic update
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));

    try {
      const res = await fetch(`/api/tm/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();

      if (!data.success) {
        // Rollback
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: oldStatus } : t));
        addToast('error', data.error || 'Failed to update status');
        return;
      }

      addToast('success', `Moved to ${STATUS_LABELS[newStatus]?.label || newStatus}`);
      fetchStats();
    } catch {
      // Rollback
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: oldStatus } : t));
      addToast('error', 'Network error — status reverted');
    }
  }, [tasks, userRole, addToast, fetchStats]);

  // ── DnD Handlers ─────────────────────────────────────────────────────────
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const taskData = event.active.data.current?.task as Task | undefined;
    if (taskData) setActiveTask(taskData);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id as string;
    const targetStatus = over.id as string;
    const currentStatus = active.data.current?.status as string;

    // Dropped on same column
    if (targetStatus === currentStatus) return;

    // Only allow dropping on kanban column statuses
    if (!KANBAN_COLUMNS.some(c => c.status === targetStatus)) return;

    handleStatusChange(taskId, targetStatus as TaskStatus);
  }, [handleStatusChange]);

  const handleDragCancel = useCallback(() => {
    setActiveTask(null);
  }, []);

  // ── Computed: valid drop targets for the active drag ─────────────────────
  const validDropStatuses = activeTask
    ? getValidTransitions(activeTask.status as TaskStatus, userRole)
    : [];

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Active Tasks" value={stats.total_active} color="text-white" />
          <StatCard label="Overdue" value={stats.overdue} color="text-red-400" alert={parseInt(stats.overdue) > 0} />
          <StatCard label="Awaiting Review" value={stats.awaiting_review} color="text-purple-400" />
          <StatCard label="Completed This Week" value={stats.completed_this_week} color="text-green-400" />
        </div>
      )}

      {/* Filter + View Toggle Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <TaskFilters
          onFilterChange={setFilters}
          showAssignee
          assignees={assignees}
        />
        <div className="flex items-center gap-1 bg-[#1a2744] border border-[#2d3a52] rounded-lg p-1">
          <button
            onClick={() => setView('kanban')}
            className={`p-1.5 rounded-md transition-colors ${view === 'kanban' ? 'bg-[#d4af37]/20 text-[#d4af37]' : 'text-[#64748b] hover:text-white'}`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setView('table')}
            className={`p-1.5 rounded-md transition-colors ${view === 'table' ? 'bg-[#d4af37]/20 text-[#d4af37]' : 'text-[#64748b] hover:text-white'}`}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : view === 'kanban' ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <KanbanViewDnd
            tasks={tasks}
            columns={KANBAN_COLUMNS}
            userRole={userRole}
            onStatusChange={handleStatusChange}
            onNavigate={(id) => router.push(`/admin/tasks/${id}`)}
            isDragActive={!!activeTask}
            validDropStatuses={validDropStatuses}
          />
          <DragOverlay dropAnimation={null}>
            {activeTask && <DragOverlayCard task={activeTask} compact />}
          </DragOverlay>
        </DndContext>
      ) : (
        <TableView
          tasks={tasks}
          userRole={userRole}
          onStatusChange={handleStatusChange}
          onTaskClick={(id) => router.push(`/admin/tasks/${id}`)}
        />
      )}

      {/* Toast container */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[999] flex flex-col gap-2">
          {toasts.map(toast => (
            <div
              key={toast.id}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg border text-xs font-medium animate-slide-up ${
                toast.type === 'success'
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : 'bg-red-500/15 text-red-400 border-red-500/30'
              }`}
            >
              {toast.type === 'success' ? <CheckCheck className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
              {toast.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── StatCard ────────────────────────────────────────────────────────────────

function StatCard({ label, value, color, alert }: { label: string; value: string; color: string; alert?: boolean }) {
  return (
    <div className={`card-premium p-4 ${alert ? 'ring-1 ring-red-500/40' : ''}`}>
      <p className="text-xs text-[#64748b] font-medium">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>
        {alert && <AlertTriangle className="inline h-5 w-5 mr-1 mb-1" />}
        {value}
      </p>
    </div>
  );
}

// ── KanbanViewDnd ───────────────────────────────────────────────────────────

function KanbanViewDnd({
  tasks,
  columns,
  userRole,
  onStatusChange,
  onNavigate,
  isDragActive,
  validDropStatuses,
}: {
  tasks: Task[];
  columns: typeof KANBAN_COLUMNS;
  userRole: string;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
  onNavigate: (id: string) => void;
  isDragActive: boolean;
  validDropStatuses: TaskStatus[];
}) {
  const overdueTasks = tasks.filter(t => t.status === 'overdue');

  return (
    <div className="space-y-4">
      {/* Overdue section — static, no DnD */}
      {overdueTasks.length > 0 && (
        <div className="card-premium p-4 border-red-500/30">
          <h3 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Overdue ({overdueTasks.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {overdueTasks.map(t => (
              <TaskManagementCard key={t.id} task={t} onClick={() => onNavigate(t.id)} />
            ))}
          </div>
        </div>
      )}

      {/* Kanban columns with drop targets */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {columns.map(col => {
          const colTasks = tasks.filter(t => t.status === col.status);
          const isValidDrop = validDropStatuses.includes(col.status as TaskStatus);

          return (
            <DroppableKanbanColumn
              key={col.status}
              status={col.status}
              label={col.label}
              icon={col.icon}
              borderColor={col.color}
              count={colTasks.length}
              isValidDrop={isValidDrop}
              isDragActive={isDragActive}
              isOver={false}
            >
              {colTasks.map(t => (
                <DraggableTaskCard
                  key={t.id}
                  task={t}
                  userRole={userRole}
                  onStatusChange={onStatusChange}
                  onNavigate={onNavigate}
                  compact
                />
              ))}
            </DroppableKanbanColumn>
          );
        })}
      </div>
    </div>
  );
}

// ── TableView ───────────────────────────────────────────────────────────────

function TableView({
  tasks,
  userRole,
  onStatusChange,
  onTaskClick,
}: {
  tasks: Task[];
  userRole: string;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
  onTaskClick: (id: string) => void;
}) {
  return (
    <div className="card-premium overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#2d3a52]">
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748b] uppercase">Task</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748b] uppercase">Agency</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748b] uppercase">Assignee</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748b] uppercase">Priority</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748b] uppercase">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748b] uppercase">Due</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map(t => {
              const isOverdue = t.status === 'overdue' || (t.due_date && new Date(t.due_date) < new Date() && t.status !== 'verified');
              const validTransitions = getValidTransitions(t.status as TaskStatus, userRole);

              return (
                <tr
                  key={t.id}
                  onClick={() => onTaskClick(t.id)}
                  className={`border-b border-[#2d3a52]/50 cursor-pointer hover:bg-[#2d3a52]/20 transition-colors ${isOverdue ? 'bg-red-500/5' : ''}`}
                >
                  <td className="px-4 py-3">
                    <span className="text-white font-medium line-clamp-1">{t.title}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-semibold text-[#64748b]">{t.agency.toUpperCase()}</span>
                  </td>
                  <td className="px-4 py-3 text-[#64748b]">{t.assignee_name || '\u2014'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs capitalize ${t.priority === 'critical' ? 'text-red-400' : t.priority === 'high' ? 'text-orange-400' : t.priority === 'medium' ? 'text-yellow-400' : 'text-green-400'}`}>
                      {t.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {validTransitions.length > 0 ? (
                      <select
                        value={t.status}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          e.stopPropagation();
                          onStatusChange(t.id, e.target.value as TaskStatus);
                        }}
                        className="text-xs bg-[#1a2744] border border-[#2d3a52] text-[#c8d0dc] rounded px-1.5 py-1 cursor-pointer hover:border-[#d4af37]/40 transition-colors"
                      >
                        <option value={t.status}>
                          {STATUS_LABELS[t.status]?.label || t.status.replace('_', ' ')}
                        </option>
                        {validTransitions.map(s => (
                          <option key={s} value={s}>
                            {STATUS_LABELS[s]?.label || s.replace('_', ' ')}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs capitalize text-[#64748b]">{t.status.replace('_', ' ')}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {t.due_date ? (
                      <span className={`text-xs ${isOverdue ? 'text-red-400 font-medium' : 'text-[#64748b]'}`}>
                        {new Date(t.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                    ) : (
                      <span className="text-xs text-[#64748b]">{'\u2014'}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
