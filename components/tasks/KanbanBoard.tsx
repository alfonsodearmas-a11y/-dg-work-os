'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import {
  RefreshCw, Plus, Search, Filter, X, Loader2, AlertTriangle,
  CheckSquare, Clock, Inbox, User, Zap, FileText,
} from 'lucide-react';
import { Task, TaskUpdate, TasksByStatus, TaskTemplate, TaskStatus } from '@/lib/task-types';
import { KanbanColumn } from './KanbanColumn';
import { TaskCard } from './TaskCard';
import { TaskDetailModal } from './TaskDetailModal';
import { CreateEventModal } from '@/components/calendar/CreateEventModal';
import { useSession } from 'next-auth/react';

const COLUMNS: (keyof TasksByStatus)[] = ['new', 'active', 'blocked', 'done'];

const COLUMN_LABELS: Record<string, string> = {
  new: 'New',
  active: 'Active',
  blocked: 'Blocked',
  done: 'Done',
};

const AGENCIES = ['GPL', 'GWI', 'HECI', 'CJIA', 'MARAD', 'GCAA', 'HAS', 'Hinterland', 'Ministry'];
const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;

interface UserOption {
  id: string;
  name: string;
  role: string;
  agency: string | null;
}

export function KanbanBoard() {
  const { data: session } = useSession();
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
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

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

  // Initial fetch
  useEffect(() => {
    fetchTasks();
    fetchUsers();
  }, [fetchTasks, fetchUsers]);

  // Poll every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setSyncing(true);
      fetchTasks();
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  // Update task
  const updateTask = async (taskId: string, updates: TaskUpdate) => {
    // Optimistic update
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

  // Apply template
  const applyTemplate = (template: TaskTemplate) => {
    setNewTitle(template.name);
    setNewDescription(template.description || '');
    setNewAgency(template.agency_slug ? template.agency_slug.toUpperCase() : '');
    setNewPriority(template.priority || 'medium');
    setShowTemplates(false);
  };

  // Fetch templates on demand
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

  // Standup digest
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

  // Drag handlers
  const handleDragStart = (event: DragStartEvent) => {
    const task = findTask(event.active.id as string);
    setActiveTask(task || null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeColumn = findColumn(activeId);
    const overColumn = COLUMNS.includes(overId as keyof TasksByStatus)
      ? (overId as keyof TasksByStatus)
      : findColumn(overId);

    if (!activeColumn || !overColumn || activeColumn === overColumn) return;

    setTasks((prev) => {
      const activeItems = [...prev[activeColumn]];
      const overItems = [...prev[overColumn]];
      const activeIndex = activeItems.findIndex((t) => t.id === activeId);
      const [movedTask] = activeItems.splice(activeIndex, 1);
      return {
        ...prev,
        [activeColumn]: activeItems,
        [overColumn]: [...overItems, movedTask],
      };
    });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeColumn = findColumn(activeId);
    const overColumn = COLUMNS.includes(overId as keyof TasksByStatus)
      ? (overId as keyof TasksByStatus)
      : findColumn(overId);

    if (!activeColumn || !overColumn) return;

    if (activeColumn !== overColumn) {
      // If dropping into blocked, prompt for reason
      if (overColumn === 'blocked') {
        setBlockedPrompt({ taskId: activeId, targetStatus: 'blocked' });
        return;
      }
      await updateTask(activeId, { status: overColumn });
    } else {
      const items = tasks[activeColumn];
      const activeIndex = items.findIndex((t) => t.id === activeId);
      const overIndex = items.findIndex((t) => t.id === overId);
      if (activeIndex !== overIndex) {
        setTasks((prev) => ({
          ...prev,
          [activeColumn]: arrayMove(prev[activeColumn], activeIndex, overIndex),
        }));
      }
    }
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
    // Revert by refetching
    fetchTasks();
    setBlockedPrompt(null);
    setBlockedReason('');
  };

  const findTask = (id: string): Task | undefined => {
    for (const status of COLUMNS) {
      const task = tasks[status].find((t) => t.id === id);
      if (task) return task;
    }
    return undefined;
  };

  const findColumn = (taskId: string): keyof TasksByStatus | null => {
    for (const status of COLUMNS) {
      if (tasks[status].some((t) => t.id === taskId)) {
        return status;
      }
    }
    return null;
  };

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

  // Compute summary stats
  const totalTasks = COLUMNS.reduce((sum, col) => sum + tasks[col].length, 0);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="flex gap-3">
          <div className="h-10 bg-[#2d3a52] rounded-lg flex-1 max-w-md" />
          <div className="h-10 bg-[#2d3a52] rounded-lg w-24" />
          <div className="h-10 bg-[#2d3a52] rounded-lg w-28" />
        </div>
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="min-w-[280px] flex-1 bg-[#1a2744] rounded-xl border border-[#2d3a52] p-4">
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
        >
          <RefreshCw className="w-4 h-4" /> Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Stats Bar */}
      {totalTasks > 0 && (
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
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748b]" />
          <input
            type="text"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-[#1a2744] border border-[#2d3a52] text-white placeholder-[#64748b] focus:outline-none focus:border-[#d4af37] transition-colors"
          />
        </div>

        {/* My Tasks Toggle */}
        <button
          onClick={() => setMyTasksOnly(!myTasksOnly)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
            myTasksOnly
              ? 'bg-[#d4af37]/20 border-[#d4af37]/50 text-[#d4af37]'
              : 'bg-[#1a2744] border-[#2d3a52] text-[#94a3b8] hover:border-[#3d4a62]'
          }`}
        >
          <User className="h-4 w-4" />
          My Tasks
        </button>

        {/* Filter Toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
            agencyFilter
              ? 'bg-[#d4af37]/20 border-[#d4af37]/50 text-[#d4af37]'
              : 'bg-[#1a2744] border-[#2d3a52] text-[#94a3b8] hover:border-[#3d4a62]'
          }`}
        >
          <Filter className="h-4 w-4" />
          Filters
        </button>

        {/* Standup */}
        <button
          onClick={generateStandup}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1a2744] border border-[#2d3a52] text-[#94a3b8] hover:border-[#d4af37]/50 hover:text-white transition-colors"
        >
          <Zap className="h-4 w-4" />
          Standup
        </button>

        {/* Add Task */}
        <button
          onClick={() => setShowNewTask(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#d4af37] text-[#0a1628] font-medium hover:bg-[#c9a432] transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Task
        </button>

        {/* Sync Button */}
        <button
          onClick={() => { setSyncing(true); fetchTasks(); }}
          disabled={syncing}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1a2744] border border-[#2d3a52] text-[#94a3b8] hover:border-[#3d4a62] transition-colors disabled:opacity-50"
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
            className="px-3 py-1.5 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white text-sm focus:outline-none focus:border-[#d4af37]"
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
            >
              <X className="h-3 w-3" />
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* New Task Form */}
      {showNewTask && (
        <div className="p-4 rounded-xl bg-[#1a2744] border border-[#d4af37]/50 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-medium text-sm">New Task</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={loadTemplates}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[#94a3b8] hover:text-white bg-[#0a1628] border border-[#2d3a52] hover:border-[#d4af37]/50 transition-colors"
              >
                <FileText className="h-3.5 w-3.5" />
                Use Template
              </button>
              <button
                onClick={resetNewTaskForm}
                className="p-1.5 rounded-lg text-[#64748b] hover:text-white hover:bg-[#2d3a52] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Template selector */}
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

          {/* Title */}
          <input
            type="text"
            placeholder="Task title..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && createTask()}
            autoFocus
            className="w-full px-3 py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white placeholder-[#64748b] focus:outline-none focus:border-[#d4af37]"
          />

          {/* Description */}
          <textarea
            placeholder="Description (optional)..."
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white placeholder-[#64748b] focus:outline-none focus:border-[#d4af37] resize-none"
          />

          {/* Row: Agency, Priority, Due Date, Assignee */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <select
              value={newAgency}
              onChange={(e) => setNewAgency(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white text-sm focus:outline-none focus:border-[#d4af37]"
            >
              <option value="">No Agency</option>
              {AGENCIES.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>

            <select
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white text-sm focus:outline-none focus:border-[#d4af37]"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
              ))}
            </select>

            <input
              type="date"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white text-sm focus:outline-none focus:border-[#d4af37]"
            />

            <select
              value={newAssignee}
              onChange={(e) => setNewAssignee(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white text-sm focus:outline-none focus:border-[#d4af37]"
            >
              <option value="">Assign to me</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}{u.agency ? ` (${u.agency})` : ''}</option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2">
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
            className="w-full px-3 py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white placeholder-[#64748b] focus:outline-none focus:border-amber-500"
          />
          <div className="flex gap-2 justify-end">
            <button onClick={cancelBlocked} className="px-3 py-1.5 rounded-lg text-sm text-[#94a3b8] hover:text-white transition-colors">
              Cancel
            </button>
            <button
              onClick={confirmBlocked}
              className="px-3 py-1.5 rounded-lg text-sm bg-amber-500 text-[#0a1628] font-medium hover:bg-amber-400 transition-colors"
            >
              Confirm
            </button>
          </div>
        </div>
      )}

      {/* Kanban Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((column) => (
            <KanbanColumn
              key={column}
              id={column}
              title={COLUMN_LABELS[column] || column}
              tasks={filterTasks(tasks[column])}
              onTaskClick={(task) => {
                setSelectedTask(task);
                setModalOpen(true);
              }}
              onCalendar={(task) => setCalendarTask(task)}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTask && (
            <div className="rotate-3 scale-105">
              <TaskCard task={activeTask} onClick={() => {}} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Task Detail Modal */}
      <TaskDetailModal
        task={selectedTask}
        isOpen={modalOpen}
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
    </div>
  );
}
