'use client';

import { useReducer, useCallback } from 'react';
import { Task, TasksByStatus, TaskStatus, TaskTemplate } from '@/lib/task-types';
import type { SortField, SortDir } from '@/components/tasks/TaskListView';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ViewMode = 'board' | 'list';
export type DueDateFilter = 'any' | 'overdue' | 'this_week' | 'this_month';

export type { SortField, SortDir };

export interface UserOption {
  id: string;
  name: string;
  role: string;
  agency: string | null;
}

export interface BoardState {
  // Data
  tasks: TasksByStatus;
  loading: boolean;
  fetchError: string | null;
  syncing: boolean;
  lastSync: string | null;
  users: UserOption[];
  templates: TaskTemplate[];

  // Drag
  draggingId: string | null;

  // View
  viewMode: ViewMode;
  mobileTab: keyof TasksByStatus;

  // Context menu / bottom sheet
  contextMenu: { task: Task; position: { x: number; y: number } } | null;
  bottomSheetTask: Task | null;

  // Filters
  searchQuery: string;
  agencyFilter: string[];
  priorityFilter: string[];
  statusFilter: string[];
  assigneeFilter: string | null;
  dueDateFilter: DueDateFilter;
  showFilters: boolean;
  myTasksOnly: boolean;

  // Sort
  sortField: SortField;
  sortDir: SortDir;
  showSortMenu: boolean;

  // New task form
  showNewTask: boolean;
  newTitle: string;
  newAgency: string;
  newPriority: string;
  newDueDate: string;
  newAssignee: string;
  newDescription: string;
  creatingTask: boolean;
  showTemplates: boolean;

  // Calendar
  calendarTask: Task | null;

  // Quick add per column
  quickAddColumn: TaskStatus | null;

  // Standup
  standupText: string;
  standupLoading: boolean;
  showStandup: boolean;

  // Blocked reason prompt
  blockedPrompt: { taskId: string; targetStatus: TaskStatus } | null;
  blockedReason: string;

  // Task detail panel
  panelTask: Task | null;
  panelOpen: boolean;

  // Undo delete
  pendingDelete: { task: Task; column: TaskStatus } | null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type BoardAction =
  // Data loading
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; tasks: TasksByStatus; lastSync: string | null }
  | { type: 'FETCH_ERROR'; error: string }
  | { type: 'SET_SYNCING'; syncing: boolean }
  | { type: 'SET_USERS'; users: UserOption[] }
  | { type: 'SET_TEMPLATES'; templates: TaskTemplate[] }
  | { type: 'SET_TASKS'; tasks: TasksByStatus }

  // View
  | { type: 'SET_VIEW_MODE'; mode: ViewMode }
  | { type: 'SET_MOBILE_TAB'; tab: keyof TasksByStatus }

  // Drag
  | { type: 'SET_DRAGGING'; id: string | null }

  // Context menu / bottom sheet
  | { type: 'SET_CONTEXT_MENU'; menu: BoardState['contextMenu'] }
  | { type: 'SET_BOTTOM_SHEET'; task: Task | null }

  // Filters
  | { type: 'SET_SEARCH'; query: string }
  | { type: 'TOGGLE_AGENCY_FILTER'; agency: string }
  | { type: 'TOGGLE_PRIORITY_FILTER'; priority: string }
  | { type: 'TOGGLE_STATUS_FILTER'; status: string }
  | { type: 'SET_ASSIGNEE_FILTER'; assignee: string | null }
  | { type: 'SET_DUE_DATE_FILTER'; filter: DueDateFilter }
  | { type: 'SET_SHOW_FILTERS'; show: boolean }
  | { type: 'SET_MY_TASKS'; myOnly: boolean }
  | { type: 'CLEAR_ALL_FILTERS' }

  // Sort
  | { type: 'TOGGLE_SORT'; field: SortField }
  | { type: 'SET_SHOW_SORT_MENU'; show: boolean }

  // New task form
  | { type: 'SET_SHOW_NEW_TASK'; show: boolean }
  | { type: 'SET_NEW_TITLE'; title: string }
  | { type: 'SET_NEW_AGENCY'; agency: string }
  | { type: 'SET_NEW_PRIORITY'; priority: string }
  | { type: 'SET_NEW_DUE_DATE'; date: string }
  | { type: 'SET_NEW_ASSIGNEE'; assignee: string }
  | { type: 'SET_NEW_DESCRIPTION'; description: string }
  | { type: 'SET_CREATING_TASK'; creating: boolean }
  | { type: 'SET_SHOW_TEMPLATES'; show: boolean }
  | { type: 'RESET_NEW_TASK_FORM' }

  // Calendar
  | { type: 'SET_CALENDAR_TASK'; task: Task | null }

  // Quick add
  | { type: 'SET_QUICK_ADD_COLUMN'; column: TaskStatus | null }

  // Standup
  | { type: 'SET_STANDUP_TEXT'; text: string }
  | { type: 'SET_STANDUP_LOADING'; loading: boolean }
  | { type: 'SET_SHOW_STANDUP'; show: boolean }

  // Blocked prompt
  | { type: 'SET_BLOCKED_PROMPT'; prompt: BoardState['blockedPrompt'] }
  | { type: 'SET_BLOCKED_REASON'; reason: string }

  // Panel
  | { type: 'OPEN_PANEL'; task: Task }
  | { type: 'CLOSE_PANEL' }

  // Delete
  | { type: 'SET_PENDING_DELETE'; pending: BoardState['pendingDelete'] }

  // Task mutations (optimistic)
  | { type: 'UPDATE_TASK_OPTIMISTIC'; taskId: string; updates: Partial<Task> }
  | { type: 'MOVE_TASK_OPTIMISTIC'; taskId: string; from: TaskStatus; to: TaskStatus }
  | { type: 'ADD_TASK'; task: Task; status: TaskStatus }
  | { type: 'REMOVE_TASK'; taskId: string }
  | { type: 'REMOVE_TASKS'; taskIds: string[] }
  | { type: 'BULK_UPDATE_OPTIMISTIC'; taskIds: string[]; updates: Partial<Task> };

// ---------------------------------------------------------------------------
// Columns constant
// ---------------------------------------------------------------------------

export const COLUMNS: (keyof TasksByStatus)[] = ['new', 'active', 'blocked', 'done'];

// ---------------------------------------------------------------------------
// Initial state factory
// ---------------------------------------------------------------------------

export function createInitialState(initialViewMode?: ViewMode): BoardState {
  return {
    tasks: { new: [], active: [], blocked: [], done: [] },
    loading: true,
    fetchError: null,
    syncing: false,
    lastSync: null,
    users: [],
    templates: [],

    draggingId: null,

    viewMode: initialViewMode || 'board',
    mobileTab: 'new',

    contextMenu: null,
    bottomSheetTask: null,

    searchQuery: '',
    agencyFilter: [],
    priorityFilter: [],
    statusFilter: [],
    assigneeFilter: null,
    dueDateFilter: 'any',
    showFilters: false,
    myTasksOnly: false,

    sortField: 'due_date',
    sortDir: 'asc',
    showSortMenu: false,

    showNewTask: false,
    newTitle: '',
    newAgency: '',
    newPriority: 'medium',
    newDueDate: '',
    newAssignee: '',
    newDescription: '',
    creatingTask: false,
    showTemplates: false,

    calendarTask: null,

    quickAddColumn: null,

    standupText: '',
    standupLoading: false,
    showStandup: false,

    blockedPrompt: null,
    blockedReason: '',

    panelTask: null,
    panelOpen: false,

    pendingDelete: null,
  };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    // --- Data ---
    case 'FETCH_START':
      return { ...state, loading: true };
    case 'FETCH_SUCCESS':
      return {
        ...state,
        tasks: action.tasks,
        lastSync: action.lastSync,
        loading: false,
        syncing: false,
        fetchError: null,
      };
    case 'FETCH_ERROR':
      return { ...state, fetchError: action.error, loading: false, syncing: false };
    case 'SET_SYNCING':
      return { ...state, syncing: action.syncing };
    case 'SET_USERS':
      return { ...state, users: action.users };
    case 'SET_TEMPLATES':
      return { ...state, templates: action.templates };
    case 'SET_TASKS':
      return { ...state, tasks: action.tasks };

    // --- View ---
    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.mode };
    case 'SET_MOBILE_TAB':
      return { ...state, mobileTab: action.tab };

    // --- Drag ---
    case 'SET_DRAGGING':
      return { ...state, draggingId: action.id };

    // --- Context menu / bottom sheet ---
    case 'SET_CONTEXT_MENU':
      return { ...state, contextMenu: action.menu };
    case 'SET_BOTTOM_SHEET':
      return { ...state, bottomSheetTask: action.task };

    // --- Filters ---
    case 'SET_SEARCH':
      return { ...state, searchQuery: action.query };
    case 'TOGGLE_AGENCY_FILTER':
      return {
        ...state,
        agencyFilter: state.agencyFilter.includes(action.agency)
          ? state.agencyFilter.filter(a => a !== action.agency)
          : [...state.agencyFilter, action.agency],
      };
    case 'TOGGLE_PRIORITY_FILTER':
      return {
        ...state,
        priorityFilter: state.priorityFilter.includes(action.priority)
          ? state.priorityFilter.filter(p => p !== action.priority)
          : [...state.priorityFilter, action.priority],
      };
    case 'TOGGLE_STATUS_FILTER':
      return {
        ...state,
        statusFilter: state.statusFilter.includes(action.status)
          ? state.statusFilter.filter(s => s !== action.status)
          : [...state.statusFilter, action.status],
      };
    case 'SET_ASSIGNEE_FILTER':
      return { ...state, assigneeFilter: action.assignee };
    case 'SET_DUE_DATE_FILTER':
      return { ...state, dueDateFilter: action.filter };
    case 'SET_SHOW_FILTERS':
      return { ...state, showFilters: action.show };
    case 'SET_MY_TASKS':
      return { ...state, myTasksOnly: action.myOnly };
    case 'CLEAR_ALL_FILTERS':
      return {
        ...state,
        searchQuery: '',
        agencyFilter: [],
        priorityFilter: [],
        statusFilter: [],
        assigneeFilter: null,
        dueDateFilter: 'any',
        myTasksOnly: false,
      };

    // --- Sort ---
    case 'TOGGLE_SORT':
      if (state.sortField === action.field) {
        return { ...state, sortDir: state.sortDir === 'asc' ? 'desc' : 'asc' };
      }
      return { ...state, sortField: action.field, sortDir: 'asc' };
    case 'SET_SHOW_SORT_MENU':
      return { ...state, showSortMenu: action.show };

    // --- New task form ---
    case 'SET_SHOW_NEW_TASK':
      return { ...state, showNewTask: action.show };
    case 'SET_NEW_TITLE':
      return { ...state, newTitle: action.title };
    case 'SET_NEW_AGENCY':
      return { ...state, newAgency: action.agency };
    case 'SET_NEW_PRIORITY':
      return { ...state, newPriority: action.priority };
    case 'SET_NEW_DUE_DATE':
      return { ...state, newDueDate: action.date };
    case 'SET_NEW_ASSIGNEE':
      return { ...state, newAssignee: action.assignee };
    case 'SET_NEW_DESCRIPTION':
      return { ...state, newDescription: action.description };
    case 'SET_CREATING_TASK':
      return { ...state, creatingTask: action.creating };
    case 'SET_SHOW_TEMPLATES':
      return { ...state, showTemplates: action.show };
    case 'RESET_NEW_TASK_FORM':
      return {
        ...state,
        newTitle: '',
        newAgency: '',
        newPriority: 'medium',
        newDueDate: '',
        newAssignee: '',
        newDescription: '',
        showNewTask: false,
        showTemplates: false,
      };

    // --- Calendar ---
    case 'SET_CALENDAR_TASK':
      return { ...state, calendarTask: action.task };

    // --- Quick add ---
    case 'SET_QUICK_ADD_COLUMN':
      return { ...state, quickAddColumn: action.column };

    // --- Standup ---
    case 'SET_STANDUP_TEXT':
      return { ...state, standupText: action.text };
    case 'SET_STANDUP_LOADING':
      return { ...state, standupLoading: action.loading };
    case 'SET_SHOW_STANDUP':
      return { ...state, showStandup: action.show };

    // --- Blocked prompt ---
    case 'SET_BLOCKED_PROMPT':
      return { ...state, blockedPrompt: action.prompt };
    case 'SET_BLOCKED_REASON':
      return { ...state, blockedReason: action.reason };

    // --- Panel ---
    case 'OPEN_PANEL':
      return { ...state, panelTask: action.task, panelOpen: true };
    case 'CLOSE_PANEL':
      return { ...state, panelOpen: false, panelTask: null };

    // --- Delete ---
    case 'SET_PENDING_DELETE':
      return { ...state, pendingDelete: action.pending };

    // --- Task mutations (optimistic) ---
    case 'UPDATE_TASK_OPTIMISTIC': {
      const newTasks = { ...state.tasks };
      let updatedPanelTask = state.panelTask;
      for (const status of COLUMNS) {
        const index = newTasks[status].findIndex(t => t.id === action.taskId);
        if (index !== -1) {
          const task = newTasks[status][index];
          const updates = action.updates;
          if (updates.status && updates.status !== status) {
            newTasks[status] = newTasks[status].filter(t => t.id !== action.taskId);
            newTasks[updates.status as keyof TasksByStatus] = [
              { ...task, ...updates } as Task,
              ...newTasks[updates.status as keyof TasksByStatus],
            ];
          } else {
            newTasks[status] = [...newTasks[status]];
            newTasks[status][index] = { ...task, ...updates } as Task;
          }
          if (updatedPanelTask && updatedPanelTask.id === action.taskId) {
            updatedPanelTask = { ...updatedPanelTask, ...updates } as Task;
          }
          break;
        }
      }
      return { ...state, tasks: newTasks, panelTask: updatedPanelTask };
    }

    case 'MOVE_TASK_OPTIMISTIC': {
      const newTasks = { ...state.tasks };
      const task = newTasks[action.from].find(t => t.id === action.taskId);
      if (!task) return state;
      newTasks[action.from] = newTasks[action.from].filter(t => t.id !== action.taskId);
      newTasks[action.to] = [{ ...task, status: action.to }, ...newTasks[action.to]];
      return { ...state, tasks: newTasks };
    }

    case 'ADD_TASK': {
      const newTasks = { ...state.tasks };
      newTasks[action.status] = [action.task, ...newTasks[action.status]];
      return { ...state, tasks: newTasks };
    }

    case 'REMOVE_TASK': {
      const newTasks = { ...state.tasks };
      for (const status of COLUMNS) {
        newTasks[status] = newTasks[status].filter(t => t.id !== action.taskId);
      }
      return { ...state, tasks: newTasks };
    }

    case 'REMOVE_TASKS': {
      const ids = new Set(action.taskIds);
      const newTasks = { ...state.tasks };
      for (const status of COLUMNS) {
        newTasks[status] = newTasks[status].filter(t => !ids.has(t.id));
      }
      return { ...state, tasks: newTasks };
    }

    case 'BULK_UPDATE_OPTIMISTIC': {
      const ids = new Set(action.taskIds);
      const newTasks = { ...state.tasks };
      for (const status of COLUMNS) {
        newTasks[status] = newTasks[status].map(t => {
          if (!ids.has(t.id)) return t;
          return { ...t, ...action.updates } as Task;
        });
      }
      // If status changed, move tasks between columns
      if (action.updates.status) {
        const targetStatus = action.updates.status as keyof TasksByStatus;
        for (const status of COLUMNS) {
          if (status === targetStatus) continue;
          const moving = newTasks[status].filter(t => ids.has(t.id));
          newTasks[status] = newTasks[status].filter(t => !ids.has(t.id));
          newTasks[targetStatus] = [
            ...moving.map(t => ({ ...t, status: targetStatus })),
            ...newTasks[targetStatus],
          ];
        }
      }
      return { ...state, tasks: newTasks };
    }

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBoardReducer() {
  const initialViewMode: ViewMode =
    typeof window !== 'undefined'
      ? (localStorage.getItem('dg-task-view') as ViewMode) || 'board'
      : 'board';

  const [state, dispatch] = useReducer(boardReducer, createInitialState(initialViewMode));

  // Convenience dispatcher for fetch success
  const setTasks = useCallback((tasks: TasksByStatus, lastSync: string | null) => {
    dispatch({ type: 'FETCH_SUCCESS', tasks, lastSync });
  }, []);

  return { state, dispatch, setTasks };
}
