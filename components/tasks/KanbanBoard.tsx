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
import { RefreshCw, Plus, Search, Filter, X, Loader2, AlertTriangle, CheckSquare, Clock, Inbox } from 'lucide-react';
import { Task, TaskUpdate } from '@/lib/task-types';
import { KanbanColumn } from './KanbanColumn';
import { TaskCard } from './TaskCard';
import { TaskDetailModal } from './TaskDetailModal';

type TasksByStatus = {
  not_started: Task[];
  in_progress: Task[];
  blocked: Task[];
  completed: Task[];
};

const COLUMNS: (keyof TasksByStatus)[] = ['not_started', 'in_progress', 'blocked', 'completed'];

const COLUMN_LABELS: Record<string, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  completed: 'Completed',
};
const AGENCIES = ['GPL', 'GWI', 'HECI', 'CJIA', 'MARAD', 'GCAA', 'HAS', 'Ministry'];
const ROLES = ['Ministry', 'GWI Board', 'NCN Board', 'UG', 'City Council', 'Meeting Action Item'];

export function KanbanBoard() {
  const [tasks, setTasks] = useState<TasksByStatus>({
    not_started: [],
    in_progress: [],
    blocked: [],
    completed: [],
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
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // New task form
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [creatingTask, setCreatingTask] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
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

  // Initial fetch
  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

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

          // If status changed, move to new column
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
      // Revert on error
      fetchTasks();
    }
  };

  // Delete task
  const deleteTask = async (taskId: string) => {
    // Optimistic update
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
    if (!newTaskTitle.trim()) return;

    setCreatingTask(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTaskTitle }),
      });
      const data = await res.json();

      if (data.task) {
        setTasks((prev) => ({
          ...prev,
          not_started: [data.task, ...prev.not_started],
        }));
      }

      setNewTaskTitle('');
      setShowNewTask(false);
    } catch (error) {
      console.error('Failed to create task:', error);
    } finally {
      setCreatingTask(false);
    }
  };

  // Drag handlers
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const task = findTask(active.id as string);
    setActiveTask(task || null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Find which columns the tasks are in
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

    // If dropped on a different column, update the status
    if (activeColumn !== overColumn) {
      await updateTask(activeId, { status: overColumn });
    } else {
      // Reorder within same column
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
      const matchesRole = !roleFilter || task.role === roleFilter;
      return matchesSearch && matchesAgency && matchesRole;
    });
  };

  const hasActiveFilters = searchQuery || agencyFilter || roleFilter;

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
          {tasks.not_started.length > 0 && (
            <span className="flex items-center gap-1 text-[#94a3b8]">
              <Inbox className="h-3.5 w-3.5" /> {tasks.not_started.length} not started
            </span>
          )}
          {tasks.in_progress.length > 0 && (
            <span className="flex items-center gap-1 text-blue-400">
              <Clock className="h-3.5 w-3.5" /> {tasks.in_progress.length} in progress
            </span>
          )}
          {tasks.blocked.length > 0 && (
            <span className="flex items-center gap-1 text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" /> {tasks.blocked.length} blocked
            </span>
          )}
          {tasks.completed.length > 0 && (
            <span className="flex items-center gap-1 text-emerald-400">
              <CheckSquare className="h-3.5 w-3.5" /> {tasks.completed.length} completed
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

        {/* Filter Toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
            hasActiveFilters
              ? 'bg-[#d4af37]/20 border-[#d4af37]/50 text-[#d4af37]'
              : 'bg-[#1a2744] border-[#2d3a52] text-[#94a3b8] hover:border-[#3d4a62]'
          }`}
        >
          <Filter className="h-4 w-4" />
          Filters
          {hasActiveFilters && (
            <span className="w-2 h-2 rounded-full bg-[#d4af37]" />
          )}
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
          onClick={() => {
            setSyncing(true);
            fetchTasks();
          }}
          disabled={syncing}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1a2744] border border-[#2d3a52] text-[#94a3b8] hover:border-[#3d4a62] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing...' : 'Sync'}
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

          <select
            value={roleFilter || ''}
            onChange={(e) => setRoleFilter(e.target.value || null)}
            className="px-3 py-1.5 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white text-sm focus:outline-none focus:border-[#d4af37]"
          >
            <option value="">All Roles</option>
            {ROLES.map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>

          {hasActiveFilters && (
            <button
              onClick={() => {
                setSearchQuery('');
                setAgencyFilter(null);
                setRoleFilter(null);
              }}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs text-[#d4af37] hover:bg-[#d4af37]/10 transition-colors"
            >
              <X className="h-3 w-3" />
              Clear filters
            </button>
          )}

          {lastSync && (
            <span className="ml-auto text-xs text-[#64748b]">
              Last synced: {new Date(lastSync).toLocaleTimeString()}
            </span>
          )}
        </div>
      )}

      {/* New Task Input */}
      {showNewTask && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-[#1a2744] border border-[#d4af37]/50">
          <input
            type="text"
            placeholder="Task title..."
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createTask()}
            autoFocus
            className="flex-1 px-3 py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white placeholder-[#64748b] focus:outline-none focus:border-[#d4af37]"
          />
          <button
            onClick={createTask}
            disabled={!newTaskTitle.trim() || creatingTask}
            className="px-4 py-2 rounded-lg bg-[#d4af37] text-[#0a1628] font-medium hover:bg-[#c9a432] transition-colors disabled:opacity-50"
          >
            {creatingTask ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
          </button>
          <button
            onClick={() => {
              setShowNewTask(false);
              setNewTaskTitle('');
            }}
            className="p-2 rounded-lg text-[#64748b] hover:text-white hover:bg-[#2d3a52] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
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
      />
    </div>
  );
}
