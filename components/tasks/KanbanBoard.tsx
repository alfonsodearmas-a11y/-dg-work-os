'use client';

import { useEffect, useCallback, useMemo, useRef } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { Task, TaskUpdate, TasksByStatus, TaskTemplate, TaskStatus } from '@/lib/task-types';
import { KanbanColumn } from './KanbanColumn';
import { TaskDetailPanel } from './TaskDetailPanel';
import { TaskContextMenu } from './TaskContextMenu';
import { TaskBottomSheet } from './TaskBottomSheet';
import { BulkActionBar } from './BulkActionBar';
import { TaskListView } from './TaskListView';
import { QuickAddTask } from './QuickAddTask';
import { NewTaskModal } from './NewTaskModal';
import { CreateEventModal } from '@/components/calendar/CreateEventModal';
import { useSession } from 'next-auth/react';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useBoardReducer, COLUMNS } from '@/hooks/useBoardReducer';
import { BoardSelectionProvider, useSelection } from './BoardSelectionContext';
import {
  KanbanToolbar,
  KanbanFilterPills,
  KanbanFilterPanel,
  buildFilterPills,
} from './KanbanFilters';
import {
  StandupModal,
  BlockedPrompt,
  UndoDeleteToast,
  MobileFab,
  SummaryStatsBar,
} from './KanbanModals';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Date filter helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Inner board (consumes selection context)
// ---------------------------------------------------------------------------

function KanbanBoardInner() {
  const { data: session } = useSession();
  const isMobile = useIsMobile();
  const { state, dispatch } = useBoardReducer();
  const { selectedIds, selectionMode, toggleSelect, clearSelection } = useSelection();

  const pendingDeleteTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist view mode
  useEffect(() => {
    localStorage.setItem('dg-task-view', state.viewMode);
  }, [state.viewMode]);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      if (data.tasks) {
        dispatch({ type: 'FETCH_SUCCESS', tasks: data.tasks, lastSync: data.lastSync });
      }
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
      dispatch({ type: 'FETCH_ERROR', error: error instanceof Error ? error.message : 'Failed to load tasks' });
    }
  }, [dispatch]);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks/users');
      const data = await res.json();
      if (data.users) dispatch({ type: 'SET_USERS', users: data.users });
    } catch {}
  }, [dispatch]);

  useEffect(() => {
    fetchTasks();
    fetchUsers();
  }, [fetchTasks, fetchUsers]);

  useEffect(() => {
    const interval = setInterval(() => {
      dispatch({ type: 'SET_SYNCING', syncing: true });
      fetchTasks();
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchTasks, dispatch]);

  // Cleanup pending delete timeout on unmount
  useEffect(() => {
    return () => {
      if (pendingDeleteTimeout.current) clearTimeout(pendingDeleteTimeout.current);
    };
  }, []);

  // Native drag-and-drop cleanup
  useEffect(() => {
    const handleDragEnd = () => dispatch({ type: 'SET_DRAGGING', id: null });
    document.addEventListener('dragend', handleDragEnd);
    return () => document.removeEventListener('dragend', handleDragEnd);
  }, [dispatch]);

  // ---------------------------------------------------------------------------
  // Task CRUD
  // ---------------------------------------------------------------------------

  const updateTask = useCallback(async (taskId: string, updates: TaskUpdate) => {
    dispatch({ type: 'UPDATE_TASK_OPTIMISTIC', taskId, updates });

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error('Failed to update task:', { status: res.status, ...errData });
        fetchTasks();
      }
    } catch (error) {
      console.error('Failed to update task:', error);
      fetchTasks();
    }
  }, [dispatch, fetchTasks]);

  const commitPendingDelete = useCallback(async (task: Task) => {
    try {
      await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
    } catch (error) {
      console.error('Failed to delete task:', error);
      fetchTasks();
    }
  }, [fetchTasks]);

  const deleteTask = useCallback(async (taskId: string) => {
    // If there's already a pending delete, commit it immediately
    if (state.pendingDelete) {
      if (pendingDeleteTimeout.current) clearTimeout(pendingDeleteTimeout.current);
      pendingDeleteTimeout.current = null;
      commitPendingDelete(state.pendingDelete.task);
      dispatch({ type: 'SET_PENDING_DELETE', pending: null });
    }

    // Find the task and its column before removing
    let deletedTask: Task | null = null;
    let deletedColumn: TaskStatus | null = null;
    for (const status of COLUMNS) {
      const found = state.tasks[status].find((t) => t.id === taskId);
      if (found) {
        deletedTask = found;
        deletedColumn = status;
        break;
      }
    }

    dispatch({ type: 'REMOVE_TASK', taskId });

    if (!deletedTask || !deletedColumn) return;

    dispatch({ type: 'SET_PENDING_DELETE', pending: { task: deletedTask, column: deletedColumn } });
    pendingDeleteTimeout.current = setTimeout(() => {
      dispatch({ type: 'SET_PENDING_DELETE', pending: null });
      pendingDeleteTimeout.current = null;
      commitPendingDelete(deletedTask!);
    }, 5000);
  }, [state.pendingDelete, state.tasks, commitPendingDelete, dispatch]);

  const handleUndoDelete = useCallback(() => {
    if (!state.pendingDelete) return;
    if (pendingDeleteTimeout.current) {
      clearTimeout(pendingDeleteTimeout.current);
      pendingDeleteTimeout.current = null;
    }
    const { task, column } = state.pendingDelete;
    dispatch({ type: 'ADD_TASK', task, status: column });
    dispatch({ type: 'SET_PENDING_DELETE', pending: null });
  }, [state.pendingDelete, dispatch]);

  // ---------------------------------------------------------------------------
  // Bulk operations
  // ---------------------------------------------------------------------------

  const bulkUpdate = useCallback(async (updates: Record<string, unknown>) => {
    const ids = Array.from(selectedIds);
    dispatch({ type: 'BULK_UPDATE_OPTIMISTIC', taskIds: ids, updates: updates as Partial<Task> });
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
  }, [selectedIds, clearSelection, dispatch, fetchTasks]);

  const bulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    dispatch({ type: 'REMOVE_TASKS', taskIds: ids });
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
  }, [selectedIds, clearSelection, dispatch, fetchTasks]);

  // ---------------------------------------------------------------------------
  // Move task (from context menu / bottom sheet)
  // ---------------------------------------------------------------------------

  const moveTask = useCallback((taskId: string, newStatus: TaskStatus) => {
    if (newStatus === 'blocked') {
      let sourceColumn: keyof TasksByStatus | null = null;
      for (const col of COLUMNS) {
        if (state.tasks[col].some((t) => t.id === taskId)) {
          sourceColumn = col;
          break;
        }
      }
      if (sourceColumn && sourceColumn !== 'blocked') {
        dispatch({ type: 'MOVE_TASK_OPTIMISTIC', taskId, from: sourceColumn, to: 'blocked' });
      }
      dispatch({ type: 'SET_BLOCKED_PROMPT', prompt: { taskId, targetStatus: 'blocked' } });
      return;
    }
    updateTask(taskId, { status: newStatus });
  }, [state.tasks, updateTask, dispatch]);

  // ---------------------------------------------------------------------------
  // Create task
  // ---------------------------------------------------------------------------

  const createTask = useCallback(async (overrides?: { title: string; status: TaskStatus; priority: string; due_date?: string; assignee_id?: string }) => {
    const title = overrides?.title || state.newTitle.trim();
    if (!title) return;

    dispatch({ type: 'SET_CREATING_TASK', creating: true });
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: overrides ? undefined : (state.newDescription || undefined),
          agency: overrides ? undefined : (state.newAgency || undefined),
          priority: overrides?.priority || state.newPriority,
          due_date: overrides?.due_date || state.newDueDate || undefined,
          assignee_id: overrides?.assignee_id || state.newAssignee || undefined,
          status: overrides?.status || 'new',
        }),
      });
      const data = await res.json();

      if (data.task) {
        const targetStatus = (overrides?.status || 'new') as keyof TasksByStatus;
        dispatch({ type: 'ADD_TASK', task: data.task, status: targetStatus });
      }

      if (!overrides) dispatch({ type: 'RESET_NEW_TASK_FORM' });
      dispatch({ type: 'SET_QUICK_ADD_COLUMN', column: null });
    } catch (error) {
      console.error('Failed to create task:', error);
    } finally {
      dispatch({ type: 'SET_CREATING_TASK', creating: false });
    }
  }, [state.newTitle, state.newDescription, state.newAgency, state.newPriority, state.newDueDate, state.newAssignee, dispatch]);

  const applyTemplate = useCallback((template: TaskTemplate) => {
    dispatch({ type: 'SET_NEW_TITLE', title: template.name });
    dispatch({ type: 'SET_NEW_DESCRIPTION', description: template.description || '' });
    dispatch({ type: 'SET_NEW_AGENCY', agency: template.agency_slug ? template.agency_slug.toUpperCase() : '' });
    dispatch({ type: 'SET_NEW_PRIORITY', priority: template.priority || 'medium' });
    dispatch({ type: 'SET_SHOW_TEMPLATES', show: false });
  }, [dispatch]);

  const loadTemplates = useCallback(async () => {
    if (state.templates.length > 0) {
      dispatch({ type: 'SET_SHOW_TEMPLATES', show: true });
      return;
    }
    try {
      const res = await fetch('/api/tasks/templates');
      const data = await res.json();
      if (data.templates) dispatch({ type: 'SET_TEMPLATES', templates: data.templates });
    } catch {}
    dispatch({ type: 'SET_SHOW_TEMPLATES', show: true });
  }, [state.templates.length, dispatch]);

  // ---------------------------------------------------------------------------
  // Standup
  // ---------------------------------------------------------------------------

  const generateStandup = useCallback(async () => {
    dispatch({ type: 'SET_STANDUP_LOADING', loading: true });
    dispatch({ type: 'SET_SHOW_STANDUP', show: true });
    try {
      const res = await fetch('/api/tasks/standup');
      const data = await res.json();
      dispatch({ type: 'SET_STANDUP_TEXT', text: data.digest || 'No digest available.' });
    } catch {
      dispatch({ type: 'SET_STANDUP_TEXT', text: 'Failed to generate standup digest.' });
    } finally {
      dispatch({ type: 'SET_STANDUP_LOADING', loading: false });
    }
  }, [dispatch]);

  // ---------------------------------------------------------------------------
  // Blocked prompt
  // ---------------------------------------------------------------------------

  const confirmBlocked = useCallback(async () => {
    if (!state.blockedPrompt) return;
    await updateTask(state.blockedPrompt.taskId, {
      status: 'blocked',
      blocked_reason: state.blockedReason || undefined,
    });
    dispatch({ type: 'SET_BLOCKED_PROMPT', prompt: null });
    dispatch({ type: 'SET_BLOCKED_REASON', reason: '' });
  }, [state.blockedPrompt, state.blockedReason, updateTask, dispatch]);

  const cancelBlocked = useCallback(() => {
    fetchTasks();
    dispatch({ type: 'SET_BLOCKED_PROMPT', prompt: null });
    dispatch({ type: 'SET_BLOCKED_REASON', reason: '' });
  }, [fetchTasks, dispatch]);

  // ---------------------------------------------------------------------------
  // Column drop handler
  // ---------------------------------------------------------------------------

  const handleColumnDrop = useCallback((taskId: string, targetColumn: string) => {
    if (!taskId) return;

    let sourceColumn: keyof TasksByStatus | null = null;
    for (const col of COLUMNS) {
      if (state.tasks[col].some((t) => t.id === taskId)) {
        sourceColumn = col;
        break;
      }
    }

    if (!sourceColumn || sourceColumn === targetColumn) return;

    if (targetColumn === 'blocked') {
      dispatch({ type: 'MOVE_TASK_OPTIMISTIC', taskId, from: sourceColumn, to: 'blocked' });
      dispatch({ type: 'SET_BLOCKED_PROMPT', prompt: { taskId, targetStatus: 'blocked' } });
      return;
    }

    updateTask(taskId, { status: targetColumn as TaskStatus });
  }, [state.tasks, updateTask, dispatch]);

  // ---------------------------------------------------------------------------
  // Panel
  // ---------------------------------------------------------------------------

  const openPanel = useCallback((task: Task) => {
    dispatch({ type: 'OPEN_PANEL', task });
  }, [dispatch]);

  // ---------------------------------------------------------------------------
  // Filtering
  // ---------------------------------------------------------------------------

  const filterTasks = useCallback((columnTasks: Task[]): Task[] => {
    return columnTasks.filter((task) => {
      const matchesSearch = !state.searchQuery ||
        task.title.toLowerCase().includes(state.searchQuery.toLowerCase());
      const matchesAgency = state.agencyFilter.length === 0 || (task.agency && state.agencyFilter.includes(task.agency));
      const matchesPriority = state.priorityFilter.length === 0 || (task.priority && state.priorityFilter.includes(task.priority));
      const matchesMy = !state.myTasksOnly || task.owner_user_id === session?.user?.id;
      const matchesAssignee = !state.assigneeFilter || task.owner_user_id === state.assigneeFilter;

      let matchesDueDate = true;
      if (state.dueDateFilter === 'overdue') {
        matchesDueDate = !!task.due_date && task.status !== 'done' && isOverdueDate(task.due_date);
      } else if (state.dueDateFilter === 'this_week') {
        matchesDueDate = !!task.due_date && isThisWeek(task.due_date);
      } else if (state.dueDateFilter === 'this_month') {
        matchesDueDate = !!task.due_date && isThisMonth(task.due_date);
      }

      let matchesStatus = true;
      if (state.statusFilter.length > 0) {
        matchesStatus = state.statusFilter.includes(task.status);
      }

      return matchesSearch && matchesAgency && matchesPriority && matchesMy && matchesAssignee && matchesDueDate && matchesStatus;
    });
  }, [state.searchQuery, state.agencyFilter, state.priorityFilter, state.myTasksOnly, state.assigneeFilter, state.dueDateFilter, state.statusFilter, session?.user?.id]);

  // All tasks flat
  const allTasks = useMemo(() => {
    const all: Task[] = [];
    for (const col of COLUMNS) {
      all.push(...state.tasks[col]);
    }
    return all;
  }, [state.tasks]);

  // Filtered tasks (for list view)
  const filteredAllTasks = useMemo(() => filterTasks(allTasks), [allTasks, filterTasks]);

  const totalTasks = COLUMNS.reduce((sum, col) => sum + state.tasks[col].length, 0);
  const filterPills = useMemo(() => buildFilterPills(state, dispatch), [state, dispatch]);

  // ---------------------------------------------------------------------------
  // Refresh handler
  // ---------------------------------------------------------------------------

  const handleRefresh = useCallback(() => {
    dispatch({ type: 'SET_SYNCING', syncing: true });
    fetchTasks();
  }, [dispatch, fetchTasks]);

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (state.loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="flex gap-3">
          <div className="h-10 bg-navy-800 rounded-lg flex-1 max-w-md" />
          <div className="h-10 bg-navy-800 rounded-lg w-24" />
          <div className="h-10 bg-navy-800 rounded-lg w-28" />
        </div>
        <div className={isMobile ? 'space-y-3' : 'flex gap-4 overflow-hidden'}>
          {Array.from({ length: isMobile ? 2 : 4 }).map((_, i) => (
            <div key={i} className={`${isMobile ? 'w-full' : 'min-w-[280px] flex-1'} bg-navy-900 rounded-xl border border-navy-800 p-4`}>
              <div className="h-5 bg-navy-800 rounded w-24 mb-4" />
              <div className="space-y-3">
                {Array.from({ length: 3 - i }).map((_, j) => (
                  <div key={j} className="h-20 bg-navy-800/50 rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (state.fetchError && totalTasks === 0) {
    return (
      <div className="bg-navy-900 rounded-xl border border-red-500/30 p-6 md:p-10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-500/15 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-7 h-7 text-red-400" />
        </div>
        <h3 className="text-white text-lg font-semibold mb-2">Failed to Load Tasks</h3>
        <p className="text-navy-600 text-sm mb-4">{state.fetchError}</p>
        <button
          onClick={() => { dispatch({ type: 'FETCH_START' }); fetchTasks(); }}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-navy-800 hover:bg-navy-700 text-white rounded-lg text-sm font-medium transition-colors"
          style={{ minHeight: 44, touchAction: 'manipulation' }}
        >
          <RefreshCw className="w-4 h-4" /> Try Again
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Summary Stats Bar */}
      {totalTasks > 0 && !isMobile && (
        <SummaryStatsBar
          tasks={state.tasks}
          totalTasks={totalTasks}
          lastSync={state.lastSync}
        />
      )}

      {/* Toolbar */}
      <KanbanToolbar
        state={state}
        dispatch={dispatch}
        isMobile={isMobile}
        onGenerateStandup={generateStandup}
        onRefresh={handleRefresh}
      />

      {/* Filter Pills */}
      <KanbanFilterPills
        pills={filterPills}
        onClearAll={() => dispatch({ type: 'CLEAR_ALL_FILTERS' })}
      />

      {/* Filter Panel */}
      <KanbanFilterPanel
        state={state}
        dispatch={dispatch}
        isMobile={isMobile}
      />

      <NewTaskModal
        isOpen={state.showNewTask}
        isMobile={isMobile}
        title={state.newTitle}
        description={state.newDescription}
        agency={state.newAgency}
        priority={state.newPriority}
        dueDate={state.newDueDate}
        assignee={state.newAssignee}
        users={state.users}
        templates={state.templates}
        showTemplates={state.showTemplates}
        creating={state.creatingTask}
        onTitleChange={(v) => dispatch({ type: 'SET_NEW_TITLE', title: v })}
        onDescriptionChange={(v) => dispatch({ type: 'SET_NEW_DESCRIPTION', description: v })}
        onAgencyChange={(v) => dispatch({ type: 'SET_NEW_AGENCY', agency: v })}
        onPriorityChange={(v) => dispatch({ type: 'SET_NEW_PRIORITY', priority: v })}
        onDueDateChange={(v) => dispatch({ type: 'SET_NEW_DUE_DATE', date: v })}
        onAssigneeChange={(v) => dispatch({ type: 'SET_NEW_ASSIGNEE', assignee: v })}
        onClose={() => dispatch({ type: 'RESET_NEW_TASK_FORM' })}
        onSubmit={() => createTask()}
        onLoadTemplates={loadTemplates}
        onApplyTemplate={applyTemplate}
      />

      {/* Blocked Reason Prompt */}
      <BlockedPrompt
        blockedPrompt={state.blockedPrompt}
        blockedReason={state.blockedReason}
        isMobile={isMobile}
        onReasonChange={(reason) => dispatch({ type: 'SET_BLOCKED_REASON', reason })}
        onConfirm={confirmBlocked}
        onCancel={cancelBlocked}
      />

      {/* === MAIN CONTENT: BOARD or LIST === */}
      {state.viewMode === 'board' ? (
        <>
          {/* Mobile: Tab Bar */}
          {isMobile && (
            <div className="flex overflow-x-auto gap-1 -mx-1 px-1 pb-1 scrollbar-none">
              {COLUMNS.map((col) => {
                const isActive = state.mobileTab === col;
                const tabStyle = COLUMN_TAB_STYLES[col];
                const count = filterTasks(state.tasks[col]).length;
                return (
                  <button
                    key={col}
                    onClick={() => dispatch({ type: 'SET_MOBILE_TAB', tab: col })}
                    className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                      isActive
                        ? `${tabStyle.active} bg-navy-900`
                        : 'border-transparent text-navy-600'
                    }`}
                    style={{ minHeight: 44, touchAction: 'manipulation' }}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${tabStyle.dot}`} aria-hidden="true" />
                    {COLUMN_LABELS[col]}
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      isActive ? 'bg-white/10' : 'bg-navy-800'
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
                key={state.mobileTab}
                id={state.mobileTab}
                title={COLUMN_LABELS[state.mobileTab] || state.mobileTab}
                tasks={filterTasks(state.tasks[state.mobileTab])}
                isMobile={true}
                draggingId={null}
                selectedIds={selectedIds}
                selectionMode={selectionMode}
                onToggleSelect={toggleSelect}
                onOpenModal={openPanel}
                onCalendar={(task) => dispatch({ type: 'SET_CALENDAR_TASK', task })}
                onDrop={handleColumnDrop}
                onContextMenu={(task, pos) => dispatch({ type: 'SET_CONTEXT_MENU', menu: { task, position: pos } })}
                onBottomSheet={(task) => dispatch({ type: 'SET_BOTTOM_SHEET', task })}
              />
              {/* Mobile quick add at bottom of active tab */}
              {state.quickAddColumn === state.mobileTab && (
                <QuickAddTask
                  status={state.mobileTab as TaskStatus}
                  isMobile={true}
                  users={state.users}
                  onAdd={async (data) => { await createTask(data); }}
                  onCancel={() => dispatch({ type: 'SET_QUICK_ADD_COLUMN', column: null })}
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
                    tasks={filterTasks(state.tasks[column])}
                    isMobile={false}
                    draggingId={state.draggingId}
                    selectedIds={selectedIds}
                    selectionMode={selectionMode}
                    onToggleSelect={toggleSelect}
                    onOpenModal={openPanel}
                    onCalendar={(task) => dispatch({ type: 'SET_CALENDAR_TASK', task })}
                    onDrop={handleColumnDrop}
                    onContextMenu={(task, pos) => dispatch({ type: 'SET_CONTEXT_MENU', menu: { task, position: pos } })}
                    onBottomSheet={(task) => dispatch({ type: 'SET_BOTTOM_SHEET', task })}
                    onQuickAdd={(status) => dispatch({ type: 'SET_QUICK_ADD_COLUMN', column: state.quickAddColumn === status ? null : status })}
                  />
                  {state.quickAddColumn === column && (
                    <div className="mt-2 px-2">
                      <QuickAddTask
                        status={column as TaskStatus}
                        isMobile={false}
                        users={state.users}
                        onAdd={async (data) => { await createTask(data); }}
                        onCancel={() => dispatch({ type: 'SET_QUICK_ADD_COLUMN', column: null })}
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
          sortField={state.sortField}
          sortDir={state.sortDir}
          onSort={(field) => dispatch({ type: 'TOGGLE_SORT', field })}
        />
      )}

      {/* Desktop Context Menu */}
      {state.contextMenu && (
        <TaskContextMenu
          task={state.contextMenu.task}
          position={state.contextMenu.position}
          onClose={() => dispatch({ type: 'SET_CONTEXT_MENU', menu: null })}
          onEdit={() => openPanel(state.contextMenu!.task)}
          onMove={moveTask}
          onDelete={deleteTask}
        />
      )}

      {/* Mobile Bottom Sheet */}
      {state.bottomSheetTask && (
        <TaskBottomSheet
          task={state.bottomSheetTask}
          onClose={() => dispatch({ type: 'SET_BOTTOM_SHEET', task: null })}
          onEdit={() => openPanel(state.bottomSheetTask!)}
          onMove={moveTask}
          onDelete={deleteTask}
        />
      )}

      {/* Task Detail Panel */}
      <TaskDetailPanel
        task={state.panelTask}
        isOpen={state.panelOpen}
        isMobile={isMobile}
        onClose={() => dispatch({ type: 'CLOSE_PANEL' })}
        onUpdate={updateTask}
        onDelete={deleteTask}
        users={state.users}
      />

      {/* Calendar Event Modal */}
      <CreateEventModal
        isOpen={!!state.calendarTask}
        onClose={() => dispatch({ type: 'SET_CALENDAR_TASK', task: null })}
        defaultTitle={state.calendarTask?.title}
        defaultDate={state.calendarTask?.due_date?.split('T')[0]}
      />

      {/* Standup Modal */}
      <StandupModal
        showStandup={state.showStandup}
        standupLoading={state.standupLoading}
        standupText={state.standupText}
        onClose={() => dispatch({ type: 'SET_SHOW_STANDUP', show: false })}
      />

      {/* Mobile FAB */}
      <MobileFab
        visible={isMobile && !state.showNewTask && !selectionMode}
        onClick={() => dispatch({ type: 'SET_SHOW_NEW_TASK', show: true })}
      />

      {/* Bulk Action Bar */}
      <BulkActionBar
        count={selectedIds.size}
        isMobile={isMobile}
        users={state.users}
        onClear={clearSelection}
        onBulkUpdate={bulkUpdate}
        onBulkDelete={bulkDelete}
      />

      {/* Undo Delete Toast */}
      <UndoDeleteToast
        visible={!!state.pendingDelete}
        onUndo={handleUndoDelete}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public export (wraps inner board with selection provider)
// ---------------------------------------------------------------------------

export function KanbanBoard() {
  return (
    <BoardSelectionProvider>
      <KanbanBoardInner />
    </BoardSelectionProvider>
  );
}
