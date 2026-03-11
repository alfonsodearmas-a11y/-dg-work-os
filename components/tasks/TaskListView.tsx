'use client';

import { useState, useMemo } from 'react';
import { Calendar, ChevronUp, ChevronDown } from 'lucide-react';
import { Task } from '@/lib/task-types';
import { format, isToday, isPast, parseISO } from 'date-fns';

interface TaskListViewProps {
  tasks: Task[];
  isMobile: boolean;
  selectedIds: Set<string>;
  selectionMode: boolean;
  onToggleSelect: (id: string) => void;
  onOpenPanel: (task: Task) => void;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
}

export type SortField = 'due_date' | 'priority' | 'created_at' | 'owner_name' | 'agency' | 'title';
export type SortDir = 'asc' | 'desc';

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-red-400',
  medium: 'bg-amber-500',
  low: 'bg-navy-600',
};

const STATUS_PILLS: Record<string, string> = {
  new: 'bg-indigo-500/20 text-indigo-400',
  active: 'bg-blue-500/20 text-blue-400',
  blocked: 'bg-amber-500/20 text-amber-400',
  done: 'bg-emerald-500/20 text-emerald-400',
};

const AGENCY_COLORS: Record<string, string> = {
  'GPL': 'bg-[#4a82f5]/15 text-[#4a82f5]',
  'GWI': 'bg-[#00c875]/15 text-[#00c875]',
  'GCAA': 'bg-[#a25ddc]/15 text-[#a25ddc]',
  'CJIA': 'bg-[#fb9d3b]/15 text-[#fb9d3b]',
  'HECI': 'bg-[#579bfc]/15 text-[#579bfc]',
  'MARAD': 'bg-[#00cec9]/15 text-[#00cec9]',
  'Hinterland': 'bg-[#2da44e]/15 text-[#2da44e]',
  'HAS': 'bg-orange-500/15 text-orange-400',
  'Ministry': 'bg-indigo-500/15 text-indigo-400',
};

export function sortTasks(tasks: Task[], field: SortField, dir: SortDir): Task[] {
  return [...tasks].sort((a, b) => {
    let cmp = 0;
    switch (field) {
      case 'due_date': {
        const aDate = a.due_date || '9999-12-31';
        const bDate = b.due_date || '9999-12-31';
        cmp = aDate.localeCompare(bDate);
        break;
      }
      case 'priority': {
        const aP = a.priority ? PRIORITY_ORDER[a.priority] ?? 4 : 4;
        const bP = b.priority ? PRIORITY_ORDER[b.priority] ?? 4 : 4;
        cmp = aP - bP;
        break;
      }
      case 'created_at':
        cmp = a.created_at.localeCompare(b.created_at);
        break;
      case 'owner_name':
        cmp = (a.owner_name || '').localeCompare(b.owner_name || '');
        break;
      case 'agency':
        cmp = (a.agency || '').localeCompare(b.agency || '');
        break;
      case 'title':
        cmp = a.title.localeCompare(b.title);
        break;
    }
    return dir === 'asc' ? cmp : -cmp;
  });
}

function SortIcon({ field, currentField, dir }: { field: SortField; currentField: SortField; dir: SortDir }) {
  if (field !== currentField) return null;
  return dir === 'asc'
    ? <ChevronUp className="h-3 w-3 text-gold-500" />
    : <ChevronDown className="h-3 w-3 text-gold-500" />;
}

export function TaskListView({
  tasks,
  isMobile,
  selectedIds,
  selectionMode,
  onToggleSelect,
  onOpenPanel,
  sortField,
  sortDir,
  onSort,
}: TaskListViewProps) {
  const sorted = useMemo(() => sortTasks(tasks, sortField, sortDir), [tasks, sortField, sortDir]);
  const [longPressTimer, setLongPressTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const allSelected = tasks.length > 0 && tasks.every(t => selectedIds.has(t.id));

  const handleHeaderSort = (field: SortField) => {
    onSort(field);
  };

  const headerClass = 'px-3 py-2.5 text-left text-xs font-medium text-navy-600 uppercase tracking-wider cursor-pointer hover:text-white select-none transition-colors';

  return (
    <div className="rounded-xl border border-navy-800 overflow-hidden bg-navy-950/50">
      {/* Table Header */}
      <div className={`hidden md:grid grid-cols-[40px_44px_1fr_100px_100px_100px_80px] bg-navy-900 border-b border-navy-800`}>
        <div className="px-3 py-2.5 flex items-center">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => {
              if (allSelected) {
                tasks.forEach(t => selectedIds.has(t.id) && onToggleSelect(t.id));
              } else {
                tasks.forEach(t => !selectedIds.has(t.id) && onToggleSelect(t.id));
              }
            }}
            aria-label="Select all tasks"
            className="w-4 h-4 rounded border-navy-800 accent-gold-500 cursor-pointer"
          />
        </div>
        <div className={headerClass} onClick={() => handleHeaderSort('priority')}>
          <div className="flex items-center gap-1">
            <SortIcon field="priority" currentField={sortField} dir={sortDir} />
          </div>
        </div>
        <div className={headerClass} onClick={() => handleHeaderSort('title')}>
          <div className="flex items-center gap-1">
            Task <SortIcon field="title" currentField={sortField} dir={sortDir} />
          </div>
        </div>
        <div className={headerClass} onClick={() => handleHeaderSort('agency')}>
          <div className="flex items-center gap-1">
            Agency <SortIcon field="agency" currentField={sortField} dir={sortDir} />
          </div>
        </div>
        <div className={headerClass} onClick={() => handleHeaderSort('owner_name')}>
          <div className="flex items-center gap-1">
            Assignee <SortIcon field="owner_name" currentField={sortField} dir={sortDir} />
          </div>
        </div>
        <div className={headerClass} onClick={() => handleHeaderSort('due_date')}>
          <div className="flex items-center gap-1">
            Due <SortIcon field="due_date" currentField={sortField} dir={sortDir} />
          </div>
        </div>
        <div className={headerClass}>
          Status
        </div>
      </div>

      {/* Rows */}
      <div className="divide-y divide-navy-800/50">
        {sorted.map((task) => {
          const isSelected = selectedIds.has(task.id);
          const isOverdue = task.due_date && task.status !== 'done' && isPast(parseISO(task.due_date)) && !isToday(parseISO(task.due_date));
          const priorityDot = task.priority ? PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium : '';

          return (
            <div
              key={task.id}
              onClick={() => {
                if (selectionMode) {
                  onToggleSelect(task.id);
                } else {
                  onOpenPanel(task);
                }
              }}
              onTouchStart={() => {
                if (!selectionMode && isMobile) {
                  const timer = setTimeout(() => {
                    onToggleSelect(task.id);
                  }, 500);
                  setLongPressTimer(timer);
                }
              }}
              onTouchEnd={() => {
                if (longPressTimer) {
                  clearTimeout(longPressTimer);
                  setLongPressTimer(null);
                }
              }}
              onTouchMove={() => {
                if (longPressTimer) {
                  clearTimeout(longPressTimer);
                  setLongPressTimer(null);
                }
              }}
              className={`cursor-pointer transition-colors ${
                isSelected
                  ? 'bg-gold-500/10 border-l-2 border-l-gold-500'
                  : 'hover:bg-navy-900/50'
              }`}
              style={{ minHeight: 44 }}
            >
              {/* Desktop row */}
              <div className="hidden md:grid grid-cols-[40px_44px_1fr_100px_100px_100px_80px] items-center">
                <div className="px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => { e.stopPropagation(); onToggleSelect(task.id); }}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select task: ${task.title}`}
                    className="w-4 h-4 rounded border-navy-800 accent-gold-500 cursor-pointer"
                  />
                </div>
                <div className="px-3 py-2.5">
                  {priorityDot && <div className={`w-2.5 h-2.5 rounded-full ${priorityDot}`} />}
                </div>
                <div className="px-3 py-2.5">
                  <span className="text-sm text-white line-clamp-1">{task.title}</span>
                </div>
                <div className="px-3 py-2.5">
                  {task.agency && (
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${AGENCY_COLORS[task.agency] || 'bg-navy-800 text-slate-400'}`}>
                      {task.agency}
                    </span>
                  )}
                </div>
                <div className="px-3 py-2.5 text-xs text-slate-400 truncate">
                  {task.owner_name ? task.owner_name.split(' ').map(w => w[0]).join('').toUpperCase() : ''}
                </div>
                <div className={`px-3 py-2.5 text-xs flex items-center gap-1 ${
                  isOverdue ? 'text-red-400' : 'text-navy-600'
                }`}>
                  {task.due_date ? (
                    <>
                      <Calendar className="h-3 w-3" />
                      {isToday(parseISO(task.due_date)) ? 'Today' : format(parseISO(task.due_date), 'MMM d')}
                    </>
                  ) : (
                    <span className="text-[#3d4a62]">&mdash;</span>
                  )}
                </div>
                <div className="px-3 py-2.5">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_PILLS[task.status] || ''}`}>
                    {task.status}
                  </span>
                </div>
              </div>

              {/* Mobile row */}
              <div className="flex md:hidden items-center gap-3 px-3 py-3" style={{ minHeight: 44 }}>
                {(selectionMode || isSelected) && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => { e.stopPropagation(); onToggleSelect(task.id); }}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select task: ${task.title}`}
                    className="w-4 h-4 rounded border-navy-800 accent-gold-500 cursor-pointer shrink-0"
                  />
                )}
                {priorityDot && <div className={`w-2 h-2 rounded-full shrink-0 ${priorityDot}`} />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{task.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {task.agency && (
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${AGENCY_COLORS[task.agency] || 'bg-navy-800 text-slate-400'}`}>
                        {task.agency}
                      </span>
                    )}
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium capitalize ${STATUS_PILLS[task.status] || ''}`}>
                      {task.status}
                    </span>
                  </div>
                </div>
                {task.due_date && (
                  <span className={`text-xs shrink-0 ${isOverdue ? 'text-red-400' : 'text-navy-600'}`}>
                    {isToday(parseISO(task.due_date)) ? 'Today' : format(parseISO(task.due_date), 'MMM d')}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {sorted.length === 0 && (
          <div className="flex items-center justify-center h-32 text-navy-600 text-sm">
            No tasks match your filters
          </div>
        )}
      </div>
    </div>
  );
}
