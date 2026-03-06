'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, Plus, Search, Filter, X, Loader2, AlertTriangle,
  CheckSquare, Clock, Inbox, User, Zap, FileText,
} from 'lucide-react';
import { Task, TaskUpdate, TasksByStatus, TaskTemplate, TaskStatus } from '@/lib/task-types';
import { KanbanColumn } from './KanbanColumn';
import { TaskDetailModal } from './TaskDetailModal';
import { TaskContextMenu } from './TaskContextMenu';
import { TaskBottomSheet } from './TaskBottomSheet';
import { CreateEventModal } from '@/components/calendar/CreateEventModal';
import { useSession } from 'next-auth/react';

const COLUMNS: (keyof TasksByStatus)[] = ['new', 'active', 'blocked', 'done'];

const COLUMN_LABELS: Record<string, string> = {
  new: 'New',
  active: 'Active',
  blocked: 'Blocked',
  done: 'Done',
};

const COLUMN_TAB_STYLES: Record<string, { active: string; dot: string }> = {
  new: { active: 'border-indigo-400 text-indigo-400', dot: 'bg-indigo-400' },
  active: { active: 'border-blue-400 text-blue-400', dot: 'bg-blue-400' },
  blocked: { active: 'border-amber-400 text-amber-400', dot: 'bg-amber-400' },
  done: { active: 'border-emerald-400 text-emerald-400', dot: 'bg-emerald-400' },
};

const AGENCIES = ['GPL', 'GWI', 'HECI', 'CJIA', 'MARAD', 'GCAA', 'HAS', 'Hinterland', 'Ministry'];
const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;

interface UserOption {
  id: string;
  name: string;
  role: string;
  agency: string | null;
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
}

export function KanbanBoard() {
  const { data: session } = useSession();
  const isMobile = useIsMobile();

  const [tasks, setTasks] = useState<TasksByStatus>({
    new: [],
    active: [],
    blocked: [],
    done: [],
  });
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Mobile tab
  const [mobileTab, setMobileTab] = useState<keyof TasksByStatus>('new');

  // Context menu (desktop)
  const [contextMenu, setContextMenu] = useState<{ task: Task; position: { x: number; y: number } } | null>(null);
  // Bottom sheet (mobile)
  const [bottomSheetTask, setBottomSheetTask] = useState<Task | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [agencyFilter, setAgencyFilter] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [myTasksOnly, setMyTasksOnly] = useState(false);

  // New task form
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newAgency, setNewAgency] = useState('');
  const [newPriority, setNewPriority] = useState('medium');
  const [newDueDate, setNewDueDate] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creatingTask, setCreatingTask] = useState(false);
  const [calendarTask, setCalendarTask] = useState<Task | null>(null);

  // Users for assignee dropdown
  const [users, setUsers] = useState<UserOption[]>([]);

  // Templates
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);

  // Standup
  const [standupText, setStandupText] = useState('');
  const [standupLoading, setStandupLoading] = useState(false);
  const [showStandup, setShowStandup] = useState(false);

  // Blocked reason prompt
  const [blockedPrompt, setBlockedPrompt] = useState<{ taskId: string; targetStatus: TaskStatus } | null>(null);
  const [blockedReason, setBlockedReason] = useState('');

  // Fetch tasks
  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      if (data.tasks) {
        setTasks(data.tasks);
        setLastSync(data.lastSync);
        setFetchError(null);
      }
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
      setFetchError(error instanceof Error ? error.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, []);

  // Fetch users
  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks/users');
      const data = await res.json();
      if (data.users) setUsers(data.users);
    } catch {}
  }, []);

  useEffect(() => {
    fetchTasks();
    fetchUsers();
  }, [fetchTasks, fetchUsers]);

  useEffect(() => {
    const interval = setInterval(() => {
      setSyncing(true);
      fetchTasks();
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  // Update task
  const updateTask = async (taskId: string, updates: TaskUpdate) => {
    setTasks((prev) => {
      const newTasks = { ...prev };
      for (const status of COLUMNS) {
        const index = newTasks[status].findIndex((t) => t.id === taskId);
        if (index !== -1) {
          const task = newTasks[status][index];
          if (updates.status && updates.status !== status) {
            newTasks[status] = newTasks[status].filter((t) => t.id !== taskId);
            newTasks[updates.status] = [
              { ...task, ...updates },
              ...newTasks[updates.status],
            ];
          } else {
            newTasks[status][index] = { ...task, ...updates };
          }
          break;
        }
      }
      return newTasks;
    });

    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
    } catch (error) {
      console.error('Failed to update task:', error);
      fetchTasks();
    }
  };

  // Delete task
  const deleteTask = async (taskId: string) => {
    setTasks((prev) => {
      const newTasks = { ...prev };
      for (const status of COLUMNS) {
        newTasks[status] = newTasks[status].filter((t) => t.id !== taskId);
      }
      return newTasks;
    });

    try {
      await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    } catch (error) {
      console.error('Failed to delete task:', error);
      fetchTasks();
    }
  };

  // Move task (from context menu / bottom sheet)
  const moveTask = useCallback((taskId: string, newStatus: TaskStatus) => {
    if (newStatus === 'blocked') {
      // Find source and optimistically move
      let sourceColumn: keyof TasksByStatus | null = null;
      for (const col of COLUMNS) {
        if (tasks[col].some((t) => t.id === taskId)) {
          sourceColumn = col;
          break;
        }
      }
      if (sourceColumn && sourceColumn !== 'blocked') {
        setTasks((prev) => {
          const task = prev[sourceColumn!].find((t) => t.id === taskId);
          if (!task) return prev;
          return {
            ...prev,
            [sourceColumn!]: prev[sourceColumn!].filter((t) => t.id !== taskId),
            blocked: [{ ...task, status: 'blocked' as TaskStatus }, ...prev.blocked],
          };
        });
      }
      setBlockedPrompt({ taskId, targetStatus: 'blocked' });
      return;
    }
    updateTask(taskId, { status: newStatus });
  }, [tasks, updateTask]);

  // Create task
  const createTask = async () => {
    if (!newTitle.trim()) return;

    setCreatingTask(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          description: newDescription || undefined,
          agency: newAgency || undefined,
          priority: newPriority,
          due_date: newDueDate || undefined,
          assignee_id: newAssignee || undefined,
        }),
      });
      const data = await res.json();

      if (data.task) {
        setTasks((prev) => ({
          ...prev,
          new: [data.task, ...prev.new],
        }));
      }

      resetNewTaskForm();
    } catch (error) {
      console.error('Failed to create task:', error);
    } finally {
      setCreatingTask(false);
    }
  };

  const resetNewTaskForm = () => {
    setNewTitle('');
    setNewAgency('');
    setNewPriority('medium');
    setNewDueDate('');
    setNewAssignee('');
    setNewDescription('');
    setShowNewTask(false);
    setShowTemplates(false);
  };

  const applyTemplate = (template: TaskTemplate) => {
    setNewTitle(template.name);
    setNewDescription(template.description || '');
    setNewAgency(template.agency_slug ? template.agency_slug.toUpperCase() : '');
    setNewPriority(template.priority || 'medium');
    setShowTemplates(false);
  };

  const loadTemplates = async () => {
    if (templates.length > 0) {
      setShowTemplates(true);
      return;
    }
    try {
      const res = await fetch('/api/tasks/templates');
      const data = await res.json();
      if (data.templates) setTemplates(data.templates);
    } catch {}
    setShowTemplates(true);
  };

  const generateStandup = async () => {
    setStandupLoading(true);
    setShowStandup(true);
    try {
      const res = await fetch('/api/tasks/standup');
      const data = await res.json();
      setStandupText(data.digest || 'No digest available.');
    } catch {
      setStandupText('Failed to generate standup digest.');
    } finally {
      setStandupLoading(false);
    }
  };

  // Native drag-and-drop cleanup
  useEffect(() => {
    const handleDragEnd = () => setDraggingId(null);
    document.addEventListener('dragend', handleDragEnd);
    return () => document.removeEventListener('dragend', handleDragEnd);
  }, []);

  // Handle drop from column
  const handleColumnDrop = (taskId: string, targetColumn: string) => {
    if (!taskId) return;

    let sourceColumn: keyof TasksByStatus | null = null;
    for (const col of COLUMNS) {
      if (tasks[col].some((t) => t.id === taskId)) {
        sourceColumn = col;
        break;
      }
    }

    if (!sourceColumn || sourceColumn === targetColumn) return;

    if (targetColumn === 'blocked') {
      setTasks((prev) => {
        const task = prev[sourceColumn!].find((t) => t.id === taskId);
        if (!task) return prev;
        return {
          ...prev,
          [sourceColumn!]: prev[sourceColumn!].filter((t) => t.id !== taskId),
          blocked: [{ ...task, status: 'blocked' as TaskStatus }, ...prev.blocked],
        };
      });
      setBlockedPrompt({ taskId, targetStatus: 'blocked' });
      return;
    }

    updateTask(taskId, { status: targetColumn as TaskStatus });
  };

  const confirmBlocked = async () => {
    if (!blockedPrompt) return;
    await updateTask(blockedPrompt.taskId, {
      status: 'blocked',
      blocked_reason: blockedReason || undefined,
    });
    setBlockedPrompt(null);
    setBlockedReason('');
  };

  const cancelBlocked = () => {
    fetchTasks();
    setBlockedPrompt(null);
    setBlockedReason('');
  };

  // Open edit modal
  const openEditModal = useCallback((task: Task) => {
    setSelectedTask(task);
    setModalOpen(true);
  }, []);

  // Filter tasks
  const filterTasks = (columnTasks: Task[]): Task[] => {
    return columnTasks.filter((task) => {
      const matchesSearch = !searchQuery ||
        task.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesAgency = !agencyFilter || task.agency === agencyFilter;
      const matchesMy = !myTasksOnly || task.owner_user_id === session?.user?.id;
      return matchesSearch && matchesAgency && matchesMy;
    });
  };

  const hasActiveFilters = searchQuery || agencyFilter || myTasksOnly;
  const totalTasks = COLUMNS.reduce((sum, col) => sum + tasks[col].length, 0);

  // --- New Task Form Content ---
  const newTaskFormContent = (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-medium text-sm">New Task</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={loadTemplates}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[#94a3b8] hover:text-white bg-[#0a1628] border border-[#2d3a52] hover:border-[#d4af37]/50 transition-colors"
            style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
          >
            <FileText className="h-3.5 w-3.5" />
            Use Template
          </button>
          <button
            onClick={resetNewTaskForm}
            className="p-1.5 rounded-lg text-[#64748b] hover:text-white hover:bg-[#2d3a52] transition-colors"
            style={{ minWidth: isMobile ? 44 : undefined, minHeight: isMobile ? 44 : undefined }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {showTemplates && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-3 rounded-lg bg-[#0a1628] border border-[#2d3a52]">
          {templates.length === 0 && (
            <p className="text-[#64748b] text-sm col-span-full">Loading templates...</p>
          )}
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => applyTemplate(t)}
              className="text-left p-3 rounded-lg bg-[#1a2744] border border-[#2d3a52] hover:border-[#d4af37]/50 transition-colors"
              style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
            >
              <p className="text-white text-sm font-medium">{t.name}</p>
              {t.description && (
                <p className="text-[#64748b] text-xs mt-1 line-clamp-2">{t.description}</p>
              )}
              {t.agency_slug && (
                <span className="inline-block mt-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#2d3a52] text-[#94a3b8]">
                  {t.agency_slug.toUpperCase()}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <input
        type="text"
        placeholder="Task title..."
        value={newTitle}
        onChange={(e) => setNewTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && createTask()}
        autoFocus
        className="w-full px-3 py-2.5 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white placeholder-[#64748b] focus:outline-none focus:border-[#d4af37]"
        style={{ minHeight: isMobile ? 44 : undefined, fontSize: isMobile ? 16 : undefined }}
      />

      <textarea
        placeholder="Description (optional)..."
        value={newDescription}
        onChange={(e) => setNewDescription(e.target.value)}
        rows={2}
        className="w-full px-3 py-2.5 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white placeholder-[#64748b] focus:outline-none focus:border-[#d4af37] resize-none"
        style={{ minHeight: isMobile ? 80 : undefined, fontSize: isMobile ? 16 : undefined }}
      />

      <div className={`grid gap-2 ${isMobile ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-4'}`}>
        <select
          value={newAgency}
          onChange={(e) => setNewAgency(e.target.value)}
          className="px-3 py-2.5 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white text-sm focus:outline-none focus:border-[#d4af37]"
          style={{ minHeight: isMobile ? 44 : undefined }}
        >
          <option value="">No Agency</option>
          {AGENCIES.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        <select
          value={newPriority}
          onChange={(e) => setNewPriority(e.target.value)}
          className="px-3 py-2.5 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white text-sm focus:outline-none focus:border-[#d4af37]"
          style={{ minHeight: isMobile ? 44 : undefined }}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
          ))}
        </select>

        <input
          type="date"
          value={newDueDate}
          onChange={(e) => setNewDueDate(e.target.value)}
          className="px-3 py-2.5 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white text-sm focus:outline-none focus:border-[#d4af37]"
          style={{ minHeight: isMobile ? 44 : undefined }}
        />

        <select
          value={newAssignee}
          onChange={(e) => setNewAssignee(e.target.value)}
          className="px-3 py-2.5 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white text-sm focus:outline-none focus:border-[#d4af37]"
          style={{ minHeight: isMobile ? 44 : undefined }}
        >
          <option value="">Assign to me</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}{u.agency ? ` (${u.agency})` : ''}</option>
          ))}
        </select>
      </div>
    </div>
  );

  // --- Loading State ---
  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="flex gap-3">
          <div className="h-10 bg-[#2d3a52] rounded-lg flex-1 max-w-md" />
          <div className="h-10 bg-[#2d3a52] rounded-lg w-24" />
          <div className="h-10 bg-[#2d3a52] rounded-lg w-28" />
        </div>
        <div className={isMobile ? 'space-y-3' : 'flex gap-4 overflow-hidden'}>
          {Array.from({ length: isMobile ? 2 : 4 }).map((_, i) => (
            <div key={i} className={`${isMobile ? 'w-full' : 'min-w-[280px] flex-1'} bg-[#1a2744] rounded-xl border border-[#2d3a52] p-4`}>
              <div className="h-5 bg-[#2d3a52] rounded w-24 mb-4" />
              <div className="space-y-3">
                {Array.from({ length: 3 - i }).map((_, j) => (
                  <div key={j} className="h-20 bg-[#2d3a52]/50 rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (fetchError && totalTasks === 0) {
    return (
      <div className="bg-[#1a2744] rounded-xl border border-red-500/30 p-6 md:p-10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-500/15 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-7 h-7 text-red-400" />
        </div>
        <h3 className="text-white text-lg font-semibold mb-2">Failed to Load Tasks</h3>
        <p className="text-[#64748b] text-sm mb-4">{fetchError}</p>
        <button
          onClick={() => { setLoading(true); fetchTasks(); }}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#2d3a52] hover:bg-[#4a5568] text-white rounded-lg text-sm font-medium transition-colors"
          style={{ minHeight: 44, touchAction: 'manipulation' }}
        >
          <RefreshCw className="w-4 h-4" /> Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Stats Bar */}
      {totalTasks > 0 && !isMobile && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-[#64748b]">{totalTasks} tasks</span>
          {tasks.new.length > 0 && (
            <span className="flex items-center gap-1 text-indigo-400">
              <Inbox className="h-3.5 w-3.5" /> {tasks.new.length} new
            </span>
          )}
          {tasks.active.length > 0 && (
            <span className="flex items-center gap-1 text-blue-400">
              <Clock className="h-3.5 w-3.5" /> {tasks.active.length} active
            </span>
          )}
          {tasks.blocked.length > 0 && (
            <span className="flex items-center gap-1 text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" /> {tasks.blocked.length} blocked
            </span>
          )}
          {tasks.done.length > 0 && (
            <span className="flex items-center gap-1 text-emerald-400">
              <CheckSquare className="h-3.5 w-3.5" /> {tasks.done.length} done
            </span>
          )}
          {lastSync && (
            <span className="ml-auto text-xs text-[#64748b]">
              Synced {new Date(lastSync).toLocaleTimeString()}
            </span>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 md:gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[140px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748b]" />
          <input
            type="text"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-[#1a2744] border border-[#2d3a52] text-white placeholder-[#64748b] focus:outline-none focus:border-[#d4af37] transition-colors"
            style={{ minHeight: isMobile ? 44 : undefined, fontSize: isMobile ? 16 : undefined }}
          />
        </div>

        {/* My Tasks Toggle */}
        <button
          onClick={() => setMyTasksOnly(!myTasksOnly)}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-colors ${
            myTasksOnly
              ? 'bg-[#d4af37]/20 border-[#d4af37]/50 text-[#d4af37]'
              : 'bg-[#1a2744] border-[#2d3a52] text-[#94a3b8] hover:border-[#3d4a62]'
          }`}
          style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
        >
          <User className="h-4 w-4" />
          {!isMobile && 'My Tasks'}
        </button>

        {/* Filter Toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-colors ${
            agencyFilter
              ? 'bg-[#d4af37]/20 border-[#d4af37]/50 text-[#d4af37]'
              : 'bg-[#1a2744] border-[#2d3a52] text-[#94a3b8] hover:border-[#3d4a62]'
          }`}
          style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
        >
          <Filter className="h-4 w-4" />
          {!isMobile && 'Filters'}
        </button>

        {/* Standup (desktop only in toolbar) */}
        {!isMobile && (
          <button
            onClick={generateStandup}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1a2744] border border-[#2d3a52] text-[#94a3b8] hover:border-[#d4af37]/50 hover:text-white transition-colors"
          >
            <Zap className="h-4 w-4" />
            Standup
          </button>
        )}

        {/* Add Task (desktop only in toolbar) */}
        {!isMobile && (
          <button
            onClick={() => setShowNewTask(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#d4af37] text-[#0a1628] font-medium hover:bg-[#c9a432] transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Task
          </button>
        )}

        {/* Sync Button */}
        <button
          onClick={() => { setSyncing(true); fetchTasks(); }}
          disabled={syncing}
          className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[#1a2744] border border-[#2d3a52] text-[#94a3b8] hover:border-[#3d4a62] transition-colors disabled:opacity-50"
          style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filter Bar */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-[#1a2744] border border-[#2d3a52]">
          <select
            value={agencyFilter || ''}
            onChange={(e) => setAgencyFilter(e.target.value || null)}
            className="px-3 py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white text-sm focus:outline-none focus:border-[#d4af37]"
            style={{ minHeight: isMobile ? 44 : undefined }}
          >
            <option value="">All Agencies</option>
            {AGENCIES.map((agency) => (
              <option key={agency} value={agency}>{agency}</option>
            ))}
          </select>

          {hasActiveFilters && (
            <button
              onClick={() => {
                setSearchQuery('');
                setAgencyFilter(null);
                setMyTasksOnly(false);
              }}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs text-[#d4af37] hover:bg-[#d4af37]/10 transition-colors"
              style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
            >
              <X className="h-3 w-3" />
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* New Task Form — Desktop: inline / Mobile: full-screen sheet */}
      {showNewTask && !isMobile && (
        <div className="p-4 rounded-xl bg-[#1a2744] border border-[#d4af37]/50">
          {newTaskFormContent}
          <div className="flex justify-end gap-2 mt-3">
            <button
              onClick={resetNewTaskForm}
              className="px-4 py-2 rounded-lg text-[#94a3b8] hover:text-white hover:bg-[#2d3a52] transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              onClick={createTask}
              disabled={!newTitle.trim() || creatingTask}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#d4af37] text-[#0a1628] font-medium hover:bg-[#c9a432] transition-colors disabled:opacity-50 text-sm"
            >
              {creatingTask ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create
            </button>
          </div>
        </div>
      )}

      {showNewTask && isMobile && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#0a1628]">
          {/* Header */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-9 h-1 rounded-full bg-white/20" />
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#2d3a52]">
            <h2 className="text-lg font-semibold text-white">New Task</h2>
            <button
              onClick={resetNewTaskForm}
              className="p-2 rounded-lg text-[#64748b] hover:text-white"
              style={{ minWidth: 44, minHeight: 44, touchAction: 'manipulation' }}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {newTaskFormContent}
          </div>
          {/* Sticky footer */}
          <div className="px-4 py-3 border-t border-[#2d3a52]" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
            <button
              onClick={createTask}
              disabled={!newTitle.trim() || creatingTask}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#d4af37] text-[#0a1628] font-semibold hover:bg-[#c9a432] transition-colors disabled:opacity-50"
              style={{ minHeight: 48, touchAction: 'manipulation' }}
            >
              {creatingTask ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
              Create Task
            </button>
          </div>
        </div>
      )}

      {/* Blocked Reason Prompt */}
      {blockedPrompt && (
        <div className="p-4 rounded-xl bg-[#1a2744] border border-amber-500/50 space-y-3">
          <p className="text-amber-400 text-sm font-medium">What&apos;s blocking this task?</p>
          <input
            type="text"
            value={blockedReason}
            onChange={(e) => setBlockedReason(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && confirmBlocked()}
            placeholder="Describe the blocker..."
            autoFocus
            className="w-full px-3 py-2.5 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white placeholder-[#64748b] focus:outline-none focus:border-amber-500"
            style={{ minHeight: isMobile ? 44 : undefined, fontSize: isMobile ? 16 : undefined }}
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={cancelBlocked}
              className="px-3 py-2 rounded-lg text-sm text-[#94a3b8] hover:text-white transition-colors"
              style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
            >
              Cancel
            </button>
            <button
              onClick={confirmBlocked}
              className="px-4 py-2 rounded-lg text-sm bg-amber-500 text-[#0a1628] font-medium hover:bg-amber-400 transition-colors"
              style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
            >
              Confirm
            </button>
          </div>
        </div>
      )}

      {/* === KANBAN BOARD === */}

      {/* Mobile: Tab Bar */}
      {isMobile && (
        <div className="flex overflow-x-auto gap-1 -mx-1 px-1 pb-1 scrollbar-none">
          {COLUMNS.map((col) => {
            const isActive = mobileTab === col;
            const tabStyle = COLUMN_TAB_STYLES[col];
            const count = filterTasks(tasks[col]).length;
            return (
              <button
                key={col}
                onClick={() => setMobileTab(col)}
                className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  isActive
                    ? `${tabStyle.active} bg-[#1a2744]`
                    : 'border-transparent text-[#64748b]'
                }`}
                style={{ minHeight: 44, touchAction: 'manipulation' }}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${tabStyle.dot}`} />
                {COLUMN_LABELS[col]}
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  isActive ? 'bg-white/10' : 'bg-[#2d3a52]'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Desktop: Multi-column / Mobile: Single column */}
      {isMobile ? (
        <KanbanColumn
          key={mobileTab}
          id={mobileTab}
          title={COLUMN_LABELS[mobileTab] || mobileTab}
          tasks={filterTasks(tasks[mobileTab])}
          isMobile={true}
          draggingId={null}
          onOpenModal={openEditModal}
          onCalendar={(task) => setCalendarTask(task)}
          onDrop={handleColumnDrop}
          onContextMenu={(task, pos) => setContextMenu({ task, position: pos })}
          onBottomSheet={(task) => setBottomSheetTask(task)}
        />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((column) => (
            <KanbanColumn
              key={column}
              id={column}
              title={COLUMN_LABELS[column] || column}
              tasks={filterTasks(tasks[column])}
              isMobile={false}
              draggingId={draggingId}
              onOpenModal={openEditModal}
              onCalendar={(task) => setCalendarTask(task)}
              onDrop={handleColumnDrop}
              onContextMenu={(task, pos) => setContextMenu({ task, position: pos })}
              onBottomSheet={(task) => setBottomSheetTask(task)}
            />
          ))}
        </div>
      )}

      {/* Desktop Context Menu */}
      {contextMenu && (
        <TaskContextMenu
          task={contextMenu.task}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
          onEdit={() => openEditModal(contextMenu.task)}
          onMove={moveTask}
          onDelete={deleteTask}
        />
      )}

      {/* Mobile Bottom Sheet */}
      {bottomSheetTask && (
        <TaskBottomSheet
          task={bottomSheetTask}
          onClose={() => setBottomSheetTask(null)}
          onEdit={() => openEditModal(bottomSheetTask)}
          onMove={moveTask}
          onDelete={deleteTask}
        />
      )}

      {/* Task Detail Modal */}
      <TaskDetailModal
        task={selectedTask}
        isOpen={modalOpen}
        isMobile={isMobile}
        onClose={() => {
          setModalOpen(false);
          setSelectedTask(null);
        }}
        onUpdate={updateTask}
        onDelete={deleteTask}
        users={users}
      />

      {/* Calendar Event Modal */}
      <CreateEventModal
        isOpen={!!calendarTask}
        onClose={() => setCalendarTask(null)}
        defaultTitle={calendarTask?.title}
        defaultDate={calendarTask?.due_date?.split('T')[0]}
      />

      {/* Standup Modal */}
      {showStandup && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowStandup(false)} />
          <div className="relative w-full max-w-lg rounded-t-2xl md:rounded-2xl bg-gradient-to-b from-[#1a2744] to-[#0f1d32] border border-[#2d3a52] shadow-2xl max-h-[80vh] overflow-y-auto" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <div className="flex items-center justify-between p-4 border-b border-[#2d3a52]">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-[#d4af37]" />
                <h2 className="text-lg font-semibold text-white">Standup Digest</h2>
              </div>
              <button onClick={() => setShowStandup(false)} className="p-2 rounded-lg text-[#64748b] hover:text-white hover:bg-[#2d3a52] transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4">
              {standupLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-[#d4af37]" />
                  <span className="ml-2 text-[#94a3b8]">Generating digest...</span>
                </div>
              ) : (
                <div className="text-[#e2e8f0] text-sm leading-relaxed whitespace-pre-line font-mono">
                  {standupText}
                </div>
              )}
            </div>
            {!standupLoading && standupText && (
              <div className="p-4 border-t border-[#2d3a52]">
                <button
                  onClick={() => { navigator.clipboard.writeText(standupText); }}
                  className="px-4 py-2 rounded-lg bg-[#2d3a52] text-white text-sm hover:bg-[#3d4a62] transition-colors"
                >
                  Copy to Clipboard
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile FAB */}
      {isMobile && !showNewTask && (
        <button
          onClick={() => setShowNewTask(true)}
          className="fixed z-40 flex items-center justify-center rounded-full shadow-lg"
          style={{
            bottom: 80,
            right: 20,
            width: 56,
            height: 56,
            background: 'linear-gradient(135deg, #e2c37a, #c9a84c)',
            color: '#0d1b2e',
            fontSize: 28,
            fontWeight: 700,
            boxShadow: '0 4px 16px rgba(201,168,76,0.4)',
            touchAction: 'manipulation',
          }}
        >
          +
        </button>
      )}
    </div>
  );
}
