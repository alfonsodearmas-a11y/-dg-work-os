'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Filter,
  AlertTriangle,
  Clock,
  CheckSquare,
  ExternalLink,
  X,
  Loader2,
} from 'lucide-react';
import { format, isPast, isToday, isWithinInterval, addDays, parseISO } from 'date-fns';

interface Task {
  notion_id: string;
  title: string;
  status: 'To Do' | 'In Progress' | 'Waiting' | 'Done';
  due_date: string | null;
  assignee: string | null;
  agency: string | null;
  role: string | null;
  priority: 'High' | 'Medium' | 'Low' | null;
  url?: string;
}

interface TasksSectionProps {
  tasks: Task[];
  onEditTask: (task: Task) => void;
  onRefresh: () => void;
}

type FilterType = 'All' | 'Overdue' | 'Due Today' | 'This Week' | 'By Agency';

const AGENCIES = ['GPL', 'GWI', 'CJIA', 'GCAA', 'MARAD', 'HAS', 'HECI', 'MOPUA'];

function isOverdue(task: Task): boolean {
  if (!task.due_date || task.status === 'Done') return false;
  const due = parseISO(task.due_date);
  return isPast(due) && !isToday(due);
}

function isDueToday(task: Task): boolean {
  if (!task.due_date) return false;
  return isToday(parseISO(task.due_date));
}

function isDueThisWeek(task: Task): boolean {
  if (!task.due_date) return false;
  const due = parseISO(task.due_date);
  const today = new Date();
  return isWithinInterval(due, { start: today, end: addDays(today, 7) });
}

function formatDueDate(task: Task): { label: string; className: string } {
  if (!task.due_date) return { label: '', className: 'text-[#64748b]' };

  const due = parseISO(task.due_date);
  const formatted = format(due, 'MMM d');

  if (isOverdue(task)) {
    return { label: `Overdue \u00b7 ${formatted}`, className: 'text-red-400' };
  }

  if (isToday(due)) {
    return { label: `Today \u00b7 ${formatted}`, className: 'text-amber-400' };
  }

  const tomorrow = addDays(new Date(), 1);
  if (
    due.getFullYear() === tomorrow.getFullYear() &&
    due.getMonth() === tomorrow.getMonth() &&
    due.getDate() === tomorrow.getDate()
  ) {
    return { label: `Tomorrow \u00b7 ${formatted}`, className: 'text-amber-400' };
  }

  return { label: formatted, className: 'text-[#64748b]' };
}

const statusStyles: Record<string, string> = {
  'To Do': 'bg-[#4a5568]/30 text-[#94a3b8]',
  'In Progress': 'bg-blue-500/20 text-blue-400',
  'Waiting': 'bg-amber-500/20 text-amber-400',
  'Done': 'bg-emerald-500/20 text-emerald-400',
};

const priorityDot: Record<string, string> = {
  High: 'bg-red-500',
  Medium: 'bg-amber-500',
  Low: 'bg-blue-500',
};

export function TasksSection({ tasks, onEditTask, onRefresh }: TasksSectionProps) {
  const overdueCount = useMemo(() => tasks.filter(isOverdue).length, [tasks]);

  const [activeFilter, setActiveFilter] = useState<FilterType>(
    overdueCount > 0 ? 'Overdue' : 'All'
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Quick-add form state
  const [newTitle, setNewTitle] = useState('');
  const [newAgency, setNewAgency] = useState('');
  const [newPriority, setNewPriority] = useState('');
  const [newDueDate, setNewDueDate] = useState('');

  // Filter tasks
  const filteredTasks = useMemo(() => {
    switch (activeFilter) {
      case 'Overdue':
        return tasks.filter(isOverdue);
      case 'Due Today':
        return tasks.filter((t) => t.status !== 'Done' && isDueToday(t));
      case 'This Week':
        return tasks.filter((t) => t.status !== 'Done' && isDueThisWeek(t));
      case 'All':
      case 'By Agency':
      default:
        return tasks.filter((t) => t.status !== 'Done');
    }
  }, [tasks, activeFilter]);

  // Group by agency
  const agencyGroups = useMemo(() => {
    const groups: Record<string, Task[]> = {};
    for (const task of filteredTasks) {
      const key = task.agency || 'General / Ministry';
      if (!groups[key]) groups[key] = [];
      groups[key].push(task);
    }

    // Sort: agencies with overdue tasks first, then by task count descending
    const entries = Object.entries(groups);
    entries.sort((a, b) => {
      const aOverdue = a[1].filter(isOverdue).length;
      const bOverdue = b[1].filter(isOverdue).length;
      if (aOverdue > 0 && bOverdue === 0) return -1;
      if (bOverdue > 0 && aOverdue === 0) return 1;
      return b[1].length - a[1].length;
    });

    return entries;
  }, [filteredTasks]);

  // Auto-expand on mount / filter change
  useMemo(() => {
    const autoExpand = new Set<string>();
    for (const [agency, agencyTasks] of agencyGroups) {
      const hasOverdue = agencyTasks.some(isOverdue);
      if (hasOverdue) {
        autoExpand.add(agency);
      }
    }
    // Always expand the first group if nothing else is expanded
    if (autoExpand.size === 0 && agencyGroups.length > 0) {
      autoExpand.add(agencyGroups[0][0]);
    }
    setExpanded(autoExpand);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter, agencyGroups.length]);

  const toggleExpanded = useCallback((agency: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(agency)) {
        next.delete(agency);
      } else {
        next.add(agency);
      }
      return next;
    });
  }, []);

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          agency: newAgency || null,
          priority: newPriority || null,
          due_date: newDueDate || null,
          status: 'To Do',
        }),
      });

      if (!res.ok) throw new Error('Failed to create task');

      // Reset form
      setNewTitle('');
      setNewAgency('');
      setNewPriority('');
      setNewDueDate('');
      setShowQuickAdd(false);
      onRefresh();
    } catch (err) {
      console.error('Failed to add task:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const filters: { label: FilterType; badge?: number; badgeColor?: string }[] = [
    { label: 'All' },
    { label: 'Overdue', badge: overdueCount > 0 ? overdueCount : undefined, badgeColor: 'bg-red-500' },
    { label: 'Due Today' },
    { label: 'This Week' },
    { label: 'By Agency' },
  ];

  const inputClasses =
    'w-full px-3 py-2 bg-[#1a2744] border border-[#2d3a52] rounded-lg text-white text-sm placeholder-[#64748b] focus:ring-2 focus:ring-[#d4af37] focus:border-[#d4af37] outline-none';

  return (
    <div className="card-premium p-4 md:p-6">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-white">TASKS</h2>
          <span className="bg-[#d4af37]/20 text-[#d4af37] text-xs font-bold px-2 py-0.5 rounded-full">
            {tasks.filter((t) => t.status !== 'Done').length}
          </span>
        </div>
        <button
          onClick={() => setShowQuickAdd((prev) => !prev)}
          className="flex items-center gap-1 bg-[#d4af37] text-[#0a1628] text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-[#d4af37]/90 transition-colors"
        >
          {showQuickAdd ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {showQuickAdd ? 'Cancel' : 'New Task'}
        </button>
      </div>

      {/* Quick-Add Form */}
      {showQuickAdd && (
        <form onSubmit={handleQuickAdd} className="card-premium p-4 space-y-3 mb-4">
          <input
            type="text"
            placeholder="Task title..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            required
            className={inputClasses}
            autoFocus
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select
              value={newAgency}
              onChange={(e) => setNewAgency(e.target.value)}
              className={inputClasses}
            >
              <option value="">Agency (optional)</option>
              {AGENCIES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <select
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value)}
              className={inputClasses}
            >
              <option value="">Priority (optional)</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
            <input
              type="date"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              className={inputClasses}
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting || !newTitle.trim()}
              className="flex items-center gap-2 bg-[#d4af37] text-[#0a1628] text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#d4af37]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Add Task
            </button>
          </div>
        </form>
      )}

      {/* Filter Pills */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
        {filters.map(({ label, badge, badgeColor }) => {
          const isActive = activeFilter === label;
          return (
            <button
              key={label}
              onClick={() => setActiveFilter(label)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-[#d4af37] text-[#0a1628]'
                  : 'bg-[#1a2744] text-[#94a3b8] border border-[#2d3a52] hover:bg-[#1a2744]/80'
              }`}
            >
              {label}
              {badge !== undefined && (
                <span
                  className={`inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full text-[10px] font-bold text-white ${badgeColor}`}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Agency Groups */}
      {agencyGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <CheckSquare className="h-10 w-10 text-[#2d3a52] mb-3" />
          <p className="text-sm text-[#64748b]">No tasks match this filter</p>
        </div>
      ) : (
        <div className="space-y-2">
          {agencyGroups.map(([agency, agencyTasks]) => {
            const isExpanded = expanded.has(agency);
            const agencyOverdue = agencyTasks.filter(isOverdue).length;

            return (
              <div key={agency}>
                {/* Agency Group Header */}
                <button
                  onClick={() => toggleExpanded(agency)}
                  className="w-full flex items-center gap-2 p-3 rounded-xl bg-[#0a1628]/50 border border-[#2d3a52]/50 hover:bg-[#0a1628]/80 transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-[#64748b] flex-shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-[#64748b] flex-shrink-0" />
                  )}
                  <span className="text-sm font-medium text-white">{agency}</span>
                  <span className="text-xs text-[#64748b]">
                    ({agencyTasks.length} task{agencyTasks.length !== 1 ? 's' : ''})
                  </span>
                  {agencyOverdue > 0 && (
                    <span className="text-xs text-red-400 font-medium">
                      &mdash; {agencyOverdue} overdue
                    </span>
                  )}
                </button>

                {/* Task Rows */}
                {isExpanded && (
                  <div className="mt-1 space-y-1 pl-2">
                    {agencyTasks.map((task) => {
                      const due = formatDueDate(task);
                      return (
                        <div
                          key={task.notion_id}
                          onClick={() => onEditTask(task)}
                          className="flex items-center gap-3 p-3 rounded-xl hover:bg-[#1a2744] transition-colors cursor-pointer min-h-[56px]"
                        >
                          {/* Priority Dot */}
                          <div
                            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                              task.priority
                                ? priorityDot[task.priority] || 'bg-[#4a5568]'
                                : 'bg-[#4a5568]'
                            }`}
                          />

                          {/* Center: Title + Assignee */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white line-clamp-1">
                              {task.title}
                            </p>
                            {(task.assignee || task.role) && (
                              <p className="text-xs text-[#64748b] mt-0.5 line-clamp-1">
                                {task.assignee || task.role}
                              </p>
                            )}
                          </div>

                          {/* Right: Due Date + Status */}
                          <div className="flex-shrink-0 text-right">
                            {due.label && (
                              <p className={`text-xs font-medium ${due.className}`}>
                                {due.label}
                              </p>
                            )}
                            <span
                              className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-medium ${
                                statusStyles[task.status] || 'bg-[#4a5568]/30 text-[#94a3b8]'
                              }`}
                            >
                              {task.status}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
