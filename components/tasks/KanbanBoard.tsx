'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  RefreshCw, Plus, Search, Filter, X, Loader2, AlertTriangle,
  CheckSquare, Clock, Inbox, User, Zap, FileText,
  LayoutGrid, List, SlidersHorizontal, ArrowUpDown,
} from 'lucide-react';
import { Task, TaskUpdate, TasksByStatus, TaskTemplate, TaskStatus } from '@/lib/task-types';
import { KanbanColumn } from './KanbanColumn';
import { TaskDetailModal } from './TaskDetailModal';
import { TaskDetailPanel } from './TaskDetailPanel';
import { TaskContextMenu } from './TaskContextMenu';
import { TaskBottomSheet } from './TaskBottomSheet';
import { BulkActionBar } from './BulkActionBar';
import { TaskListView, SortField, SortDir, sortTasks } from './TaskListView';
import { QuickAddTask } from './QuickAddTask';
import { NewTaskModal } from './NewTaskModal';
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

type ViewMode = 'board' | 'list';
type DueDateFilter = 'any' | 'overdue' | 'this_week' | 'this_month';

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

function isThisWeek(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);
  return d >= startOfWeek && d < endOfWeek;
}

function isThisMonth(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

function isOverdueDate(dateStr: string): boolean {
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return d < today;
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

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('dg-task-view') as ViewMode) || 'board';
    }
    return 'board';
  });

  // Mobile tab
  const [mobileTab, setMobileTab] = useState<keyof TasksByStatus>('new');

  // Context menu (desktop)
  const [contextMenu, setContextMenu] = useState<{ task: Task; position: { x: number; y: number } } | null>(null);
  // Bottom sheet (mobile)
  const [bottomSheetTask, setBottomSheetTask] = useState<Task | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [agencyFilter, setAgencyFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null);
  const [dueDateFilter, setDueDateFilter] = useState<DueDateFilter>('any');
  const [showFilters, setShowFilters] = useState(false);
  const [myTasksOnly, setMyTasksOnly] = useState(false);

  // Sort
  const [sortField, setSortField] = useState<SortField>('due_date');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [showSortMenu, setShowSortMenu] = useState(false);

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectionMode = selectedIds.size > 0;

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

  // Quick add per column
  const [quickAddColumn, setQuickAddColumn] = useState<TaskStatus | null>(null);

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

  // Task detail panel
  const [panelTask, setPanelTask] = useState<Task | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  // Persist view mode
  useEffect(() => {
    localStorage.setItem('dg-task-view', viewMode);
  }, [viewMode]);

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

  // Toggle selection
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

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

    // Also update panelTask if it's the one being edited
    if (panelTask && panelTask.id === taskId) {
      setPanelTask(prev => prev ? { ...prev, ...updates } : null);
    }

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error('Failed to update task:', { status: res.status, ...errData });
        fetchTasks(); // Roll back optimistic update
      }
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
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(taskId);
      return next;
    });

    try {
      await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    } catch (error) {
      console.error('Failed to delete task:', error);
      fetchTasks();
    }
  };

  // Bulk update
  const bulkUpdate = async (updates: Record<string, unknown>) => {
    const ids = Array.from(selectedIds);
    // Optimistic update
    setTasks(prev => {
      const newTasks = { ...prev };
      for (const status of COLUMNS) {
        newTasks[status] = newTasks[status].map(t => {
          if (!selectedIds.has(t.id)) return t;
          const updated = { ...t };
          if (updates.status) (updated as Record<string, unknown>).status = updates.status;
          if (updates.agency !== undefined) (updated as Record<string, unknown>).agency = updates.agency;
          if (updates.due_date !== undefined) (updated as Record<string, unknown>).due_date = updates.due_date;
          return updated as Task;
        });
      }
      // If status changed, move tasks between columns
      if (updates.status) {
        const targetStatus = updates.status as keyof TasksByStatus;
        for (const status of COLUMNS) {
          if (status === targetStatus) continue;
          const moving = newTasks[status].filter(t => selectedIds.has(t.id));
          newTasks[status] = newTasks[status].filter(t => !selectedIds.has(t.id));
          newTasks[targetStatus] = [...moving.map(t => ({ ...t, status: targetStatus })), ...newTasks[targetStatus]];
        }
      }
      return newTasks;
    });

    clearSelection();

    try {
      await fetch('/api/tasks/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskIds: ids, updates }),
      });
    } catch {
      fetchTasks();
    }
  };

  // Bulk delete
  const bulkDelete = async () => {
    const ids = Array.from(selectedIds);
    // Optimistic: remove selected tasks
    setTasks(prev => {
      const newTasks = { ...prev };
      for (const status of COLUMNS) {
        newTasks[status] = newTasks[status].filter(t => !selectedIds.has(t.id));
      }
      return newTasks;
    });
    clearSelection();

    try {
      await fetch('/api/tasks/bulk', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskIds: ids }),
      });
    } catch {
      fetchTasks();
    }
  };

  // Move task (from context menu / bottom sheet)
  const moveTask = useCallback((taskId: string, newStatus: TaskStatus) => {
    if (newStatus === 'blocked') {
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
  }, [tasks, updateTask]); // eslint-disable-line react-hooks/exhaustive-deps

  // Create task
  const createTask = async (overrides?: { title: string; status: TaskStatus; priority: string; due_date?: string; assignee_id?: string }) => {
    const title = overrides?.title || newTitle.trim();
    if (!title) return;

    setCreatingTask(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: overrides ? undefined : (newDescription || undefined),
          agency: overrides ? undefined : (newAgency || undefined),
          priority: overrides?.priority || newPriority,
          due_date: overrides?.due_date || newDueDate || undefined,
          assignee_id: overrides?.assignee_id || newAssignee || undefined,
          status: overrides?.status || 'new',
        }),
      });
      const data = await res.json();

      if (data.task) {
        const targetStatus = (overrides?.status || 'new') as keyof TasksByStatus;
        setTasks((prev) => ({
          ...prev,
          [targetStatus]: [data.task, ...prev[targetStatus]],
        }));
      }

      if (!overrides) resetNewTaskForm();
      setQuickAddColumn(null);
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

  // Open detail panel (for list view clicks and double-clicks)
  const openPanel = useCallback((task: Task) => {
    setPanelTask(task);
    setPanelOpen(true);
  }, []);

  // Open edit modal (keep for backward compat with context menu)
  const openEditModal = useCallback((task: Task) => {
    openPanel(task);
  }, [openPanel]);

  // Handle sort toggle
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  // Filter tasks
  const filterTasks = useCallback((columnTasks: Task[]): Task[] => {
    return columnTasks.filter((task) => {
      const matchesSearch = !searchQuery ||
        task.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesAgency = agencyFilter.length === 0 || (task.agency && agencyFilter.includes(task.agency));
      const matchesPriority = priorityFilter.length === 0 || (task.priority && priorityFilter.includes(task.priority));
      const matchesMy = !myTasksOnly || task.owner_user_id === session?.user?.id;
      const matchesAssignee = !assigneeFilter || task.owner_user_id === assigneeFilter;

      let matchesDueDate = true;
      if (dueDateFilter === 'overdue') {
        matchesDueDate = !!task.due_date && task.status !== 'done' && isOverdueDate(task.due_date);
      } else if (dueDateFilter === 'this_week') {
        matchesDueDate = !!task.due_date && isThisWeek(task.due_date);
      } else if (dueDateFilter === 'this_month') {
        matchesDueDate = !!task.due_date && isThisMonth(task.due_date);
      }

      let matchesStatus = true;
      if (statusFilter.length > 0) {
        matchesStatus = statusFilter.includes(task.status);
      }

      return matchesSearch && matchesAgency && matchesPriority && matchesMy && matchesAssignee && matchesDueDate && matchesStatus;
    });
  }, [searchQuery, agencyFilter, priorityFilter, myTasksOnly, assigneeFilter, dueDateFilter, statusFilter, session?.user?.id]);

  // All tasks flat
  const allTasks = useMemo(() => {
    const all: Task[] = [];
    for (const col of COLUMNS) {
      all.push(...tasks[col]);
    }
    return all;
  }, [tasks]);

  // Filtered tasks (for list view)
  const filteredAllTasks = useMemo(() => filterTasks(allTasks), [allTasks, filterTasks]);

  const hasActiveFilters = searchQuery || agencyFilter.length > 0 || priorityFilter.length > 0 || myTasksOnly || assigneeFilter || dueDateFilter !== 'any' || statusFilter.length > 0;
  const totalTasks = COLUMNS.reduce((sum, col) => sum + tasks[col].length, 0);

  const clearAllFilters = () => {
    setSearchQuery('');
    setAgencyFilter([]);
    setPriorityFilter([]);
    setStatusFilter([]);
    setAssigneeFilter(null);
    setDueDateFilter('any');
    setMyTasksOnly(false);
  };

  // Active filter pills
  const filterPills: { label: string; onClear: () => void }[] = [];
  for (const a of agencyFilter) {
    filterPills.push({ label: `Agency: ${a}`, onClear: () => setAgencyFilter(prev => prev.filter(x => x !== a)) });
  }
  for (const p of priorityFilter) {
    filterPills.push({ label: `Priority: ${p}`, onClear: () => setPriorityFilter(prev => prev.filter(x => x !== p)) });
  }
  for (const s of statusFilter) {
    filterPills.push({ label: `Status: ${s}`, onClear: () => setStatusFilter(prev => prev.filter(x => x !== s)) });
  }
  if (dueDateFilter !== 'any') {
    filterPills.push({ label: `Due: ${dueDateFilter.replace('_', ' ')}`, onClear: () => setDueDateFilter('any') });
  }
  if (assigneeFilter) {
    const userName = users.find(u => u.id === assigneeFilter)?.name || 'Unknown';
    filterPills.push({ label: `Assignee: ${userName}`, onClear: () => setAssigneeFilter(null) });
  }

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
        {/* View Toggle */}
        <div className="flex rounded-lg border border-[#2d3a52] overflow-hidden">
          <button
            onClick={() => setViewMode('board')}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
              viewMode === 'board'
                ? 'bg-[#2d3a52] text-white'
                : 'bg-[#1a2744] text-[#64748b] hover:text-[#94a3b8]'
            }`}
            style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
            aria-label="Board view"
          >
            <LayoutGrid className="h-4 w-4" />
            {!isMobile && 'Board'}
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
              viewMode === 'list'
                ? 'bg-[#2d3a52] text-white'
                : 'bg-[#1a2744] text-[#64748b] hover:text-[#94a3b8]'
            }`}
            style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
            aria-label="List view"
          >
            <List className="h-4 w-4" />
            {!isMobile && 'List'}
          </button>
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[140px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748b]" />
          <input
            type="text"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search tasks"
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
            hasActiveFilters
              ? 'bg-[#d4af37]/20 border-[#d4af37]/50 text-[#d4af37]'
              : 'bg-[#1a2744] border-[#2d3a52] text-[#94a3b8] hover:border-[#3d4a62]'
          }`}
          style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
        >
          <SlidersHorizontal className="h-4 w-4" />
          {!isMobile && 'Filters'}
        </button>

        {/* Sort (for list view or always) */}
        <div className="relative">
          <button
            onClick={() => setShowSortMenu(!showSortMenu)}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg border bg-[#1a2744] border-[#2d3a52] text-[#94a3b8] hover:border-[#3d4a62] transition-colors"
            style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
          >
            <ArrowUpDown className="h-4 w-4" />
            {!isMobile && 'Sort'}
          </button>
          {showSortMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowSortMenu(false)} />
              <div className="absolute top-full right-0 mt-1 z-50 rounded-xl bg-[#142238] border border-[#2d3a52] shadow-xl py-1 min-w-[180px]">
                {([
                  { field: 'due_date', label: 'Due Date' },
                  { field: 'priority', label: 'Priority' },
                  { field: 'created_at', label: 'Created' },
                  { field: 'owner_name', label: 'Assignee' },
                  { field: 'agency', label: 'Agency' },
                ] as { field: SortField; label: string }[]).map(opt => (
                  <button
                    key={opt.field}
                    onClick={() => { handleSort(opt.field); setShowSortMenu(false); }}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 text-sm text-left transition-colors ${
                      sortField === opt.field ? 'text-[#d4af37] bg-[#d4af37]/5' : 'text-[#e2e8f0] hover:bg-[#1a2744]'
                    }`}
                    style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
                  >
                    {opt.label}
                    {sortField === opt.field && (
                      <span className="text-xs text-[#d4af37]">{sortDir === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

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
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Task
          </button>
        )}

        {/* Sync Button */}
        <button
          onClick={() => { setSyncing(true); fetchTasks(); }}
          disabled={syncing}
          className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[#1a2744] border border-[#2d3a52] text-[#94a3b8] hover:border-[#3d4a62] transition-colors disabled:opacity-50"
          style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
          aria-label="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filter Pills */}
      {filterPills.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {filterPills.map((pill, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-[#d4af37]/15 text-[#d4af37] border border-[#d4af37]/30"
            >
              {pill.label}
              <button
                onClick={pill.onClear}
                className="hover:text-white transition-colors"
                style={{ touchAction: 'manipulation' }}
                aria-label={`Remove ${pill.label} filter`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button
            onClick={clearAllFilters}
            className="text-xs text-[#64748b] hover:text-white transition-colors"
            style={{ touchAction: 'manipulation' }}
          >
            Clear all
          </button>
        </div>
      )}

      {/* Filter Panel */}
      {showFilters && (
        <div className="p-4 rounded-xl bg-[#1a2744] border border-[#2d3a52] space-y-4">
          <div className={`grid gap-4 ${isMobile ? 'grid-cols-1' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5'}`}>
            {/* Agency multi-select */}
            <div>
              <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">Agency</label>
              <div className="space-y-1 max-h-[160px] overflow-y-auto">
                {AGENCIES.map(a => (
                  <label key={a} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#0a1628] cursor-pointer transition-colors" style={{ minHeight: isMobile ? 44 : undefined }}>
                    <input
                      type="checkbox"
                      checked={agencyFilter.includes(a)}
                      onChange={() => setAgencyFilter(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a])}
                      className="w-3.5 h-3.5 rounded border-[#2d3a52] accent-[#d4af37]"
                    />
                    <span className="text-sm text-[#e2e8f0]">{a}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Assignee */}
            <div>
              <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">Assignee</label>
              <select
                value={assigneeFilter || ''}
                onChange={(e) => setAssigneeFilter(e.target.value || null)}
                aria-label="Assignee"
                className="w-full px-3 py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white text-sm focus:outline-none focus:border-[#d4af37]"
                style={{ minHeight: isMobile ? 44 : undefined }}
              >
                <option value="">All</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>

            {/* Priority multi-select */}
            <div>
              <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">Priority</label>
              <div className="space-y-1">
                {PRIORITIES.map(p => (
                  <label key={p} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#0a1628] cursor-pointer transition-colors" style={{ minHeight: isMobile ? 44 : undefined }}>
                    <input
                      type="checkbox"
                      checked={priorityFilter.includes(p)}
                      onChange={() => setPriorityFilter(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])}
                      className="w-3.5 h-3.5 rounded border-[#2d3a52] accent-[#d4af37]"
                    />
                    <span className="text-sm text-[#e2e8f0] capitalize">{p}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Due Date filter */}
            <div>
              <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">Due Date</label>
              <div className="space-y-1">
                {([
                  { value: 'any', label: 'Any' },
                  { value: 'overdue', label: 'Overdue' },
                  { value: 'this_week', label: 'This week' },
                  { value: 'this_month', label: 'This month' },
                ] as { value: DueDateFilter; label: string }[]).map(opt => (
                  <label key={opt.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#0a1628] cursor-pointer transition-colors" style={{ minHeight: isMobile ? 44 : undefined }}>
                    <input
                      type="radio"
                      name="dueDateFilter"
                      checked={dueDateFilter === opt.value}
                      onChange={() => setDueDateFilter(opt.value)}
                      className="w-3.5 h-3.5 accent-[#d4af37]"
                    />
                    <span className="text-sm text-[#e2e8f0]">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Status filter */}
            <div>
              <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">Status</label>
              <div className="space-y-1">
                {(['new', 'active', 'blocked', 'done'] as const).map(s => (
                  <label key={s} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#0a1628] cursor-pointer transition-colors" style={{ minHeight: isMobile ? 44 : undefined }}>
                    <input
                      type="checkbox"
                      checked={statusFilter.includes(s)}
                      onChange={() => setStatusFilter(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}
                      className="w-3.5 h-3.5 rounded border-[#2d3a52] accent-[#d4af37]"
                    />
                    <span className="text-sm text-[#e2e8f0] capitalize">{s}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-[#2d3a52]">
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs text-[#d4af37] hover:bg-[#d4af37]/10 transition-colors"
                style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
              >
                <X className="h-3 w-3" />
                Clear filters
              </button>
            )}
            <button
              onClick={() => setShowFilters(false)}
              className="px-3 py-1.5 rounded-lg text-xs text-[#94a3b8] hover:text-white bg-[#0a1628] border border-[#2d3a52] transition-colors ml-auto"
              style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      <NewTaskModal
        isOpen={showNewTask}
        isMobile={isMobile}
        title={newTitle}
        description={newDescription}
        agency={newAgency}
        priority={newPriority}
        dueDate={newDueDate}
        assignee={newAssignee}
        users={users}
        templates={templates}
        showTemplates={showTemplates}
        creating={creatingTask}
        onTitleChange={setNewTitle}
        onDescriptionChange={setNewDescription}
        onAgencyChange={setNewAgency}
        onPriorityChange={setNewPriority}
        onDueDateChange={setNewDueDate}
        onAssigneeChange={setNewAssignee}
        onClose={resetNewTaskForm}
        onSubmit={() => createTask()}
        onLoadTemplates={loadTemplates}
        onApplyTemplate={applyTemplate}
      />

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
            aria-label="Blocked reason"
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

      {/* === MAIN CONTENT: BOARD or LIST === */}
      {viewMode === 'board' ? (
        <>
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
                    <span className={`w-1.5 h-1.5 rounded-full ${tabStyle.dot}`} aria-hidden="true" />
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
            <>
              <KanbanColumn
                key={mobileTab}
                id={mobileTab}
                title={COLUMN_LABELS[mobileTab] || mobileTab}
                tasks={filterTasks(tasks[mobileTab])}
                isMobile={true}
                draggingId={null}
                selectedIds={selectedIds}
                selectionMode={selectionMode}
                onToggleSelect={toggleSelect}
                onOpenModal={openEditModal}
                onCalendar={(task) => setCalendarTask(task)}
                onDrop={handleColumnDrop}
                onContextMenu={(task, pos) => setContextMenu({ task, position: pos })}
                onBottomSheet={(task) => setBottomSheetTask(task)}
              />
              {/* Mobile quick add at bottom of active tab */}
              {quickAddColumn === mobileTab && (
                <QuickAddTask
                  status={mobileTab as TaskStatus}
                  isMobile={true}
                  users={users}
                  onAdd={async (data) => { await createTask(data); }}
                  onCancel={() => setQuickAddColumn(null)}
                />
              )}
            </>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-4">
              {COLUMNS.map((column) => (
                <div key={column} className="flex-1 min-w-[280px] max-w-[320px]">
                  <KanbanColumn
                    id={column}
                    title={COLUMN_LABELS[column] || column}
                    tasks={filterTasks(tasks[column])}
                    isMobile={false}
                    draggingId={draggingId}
                    selectedIds={selectedIds}
                    selectionMode={selectionMode}
                    onToggleSelect={toggleSelect}
                    onOpenModal={openEditModal}
                    onCalendar={(task) => setCalendarTask(task)}
                    onDrop={handleColumnDrop}
                    onContextMenu={(task, pos) => setContextMenu({ task, position: pos })}
                    onBottomSheet={(task) => setBottomSheetTask(task)}
                    onQuickAdd={(status) => setQuickAddColumn(quickAddColumn === status ? null : status)}
                  />
                  {quickAddColumn === column && (
                    <div className="mt-2 px-2">
                      <QuickAddTask
                        status={column as TaskStatus}
                        isMobile={false}
                        users={users}
                        onAdd={async (data) => { await createTask(data); }}
                        onCancel={() => setQuickAddColumn(null)}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        /* LIST VIEW */
        <TaskListView
          tasks={filteredAllTasks}
          isMobile={isMobile}
          selectedIds={selectedIds}
          selectionMode={selectionMode}
          onToggleSelect={toggleSelect}
          onOpenPanel={openPanel}
          sortField={sortField}
          sortDir={sortDir}
          onSort={handleSort}
        />
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

      {/* Task Detail Panel (replaces modal) */}
      <TaskDetailPanel
        task={panelTask}
        isOpen={panelOpen}
        isMobile={isMobile}
        onClose={() => {
          setPanelOpen(false);
          setPanelTask(null);
        }}
        onUpdate={updateTask}
        onDelete={deleteTask}
        users={users}
      />

      {/* Legacy Task Detail Modal (kept for backward compat but panel is primary) */}
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
              <button onClick={() => setShowStandup(false)} className="p-2 rounded-lg text-[#64748b] hover:text-white hover:bg-[#2d3a52] transition-colors" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4">
              {standupLoading ? (
                <div className="flex items-center justify-center py-8" role="status" aria-label="Loading">
                  <Loader2 className="h-6 w-6 animate-spin text-[#d4af37]" aria-hidden="true" />
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
      {isMobile && !showNewTask && !selectionMode && (
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

      {/* Bulk Action Bar */}
      <BulkActionBar
        count={selectedIds.size}
        isMobile={isMobile}
        users={users}
        onClear={clearSelection}
        onBulkUpdate={bulkUpdate}
        onBulkDelete={bulkDelete}
      />
    </div>
  );
}
