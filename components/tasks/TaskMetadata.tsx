'use client';

import { Task, TaskUpdate } from '@/lib/task-types';
import { format, parseISO } from 'date-fns';

interface UserOption {
  id: string;
  name: string;
  role: string;
  agency: string | null;
}

const AGENCIES = ['GPL', 'GWI', 'HECI', 'CJIA', 'MARAD', 'GCAA', 'HAS', 'Hinterland', 'Ministry'];
const PRIORITIES = [
  { value: 'critical', label: 'Critical', color: 'text-red-400' },
  { value: 'high', label: 'High', color: 'text-red-400' },
  { value: 'medium', label: 'Medium', color: 'text-amber-400' },
  { value: 'low', label: 'Low', color: 'text-navy-600' },
];

interface TaskMetadataProps {
  task: Task;
  isMobile: boolean;
  users: UserOption[];
  openDropdown: string | null;
  onOpenDropdownChange: (dropdown: string | null) => void;
  onInlineUpdate: (updates: TaskUpdate, field: string) => void;
}

export function TaskMetadata({
  task,
  isMobile,
  users,
  openDropdown,
  onOpenDropdownChange,
  onInlineUpdate,
}: TaskMetadataProps) {
  const inputStyle: React.CSSProperties = isMobile ? { minHeight: 44, fontSize: 16 } : {};

  return (
    <div className="p-4 border-b border-navy-800">
      <h3 className="text-xs font-semibold text-navy-600 uppercase tracking-wider mb-3">Details</h3>
      <div className="space-y-3">
        {/* Priority */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-navy-600 w-20 shrink-0">Priority</span>
          <div className="relative flex-1 text-right">
            <button
              onClick={() => onOpenDropdownChange(openDropdown === 'priority' ? null : 'priority')}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-sm text-slate-200 hover:bg-navy-800 transition-colors"
              style={{ touchAction: 'manipulation' }}
            >
              {task.priority ? (
                <span className={`capitalize ${PRIORITIES.find(p => p.value === task.priority)?.color || ''}`}>
                  {task.priority}
                </span>
              ) : (
                <span className="text-navy-600">None</span>
              )}
            </button>
            {openDropdown === 'priority' && (
              <div className="absolute top-full right-0 mt-1 z-20 rounded-xl bg-[#142238] border border-navy-800 shadow-xl py-1 min-w-[120px]">
                {PRIORITIES.map(p => (
                  <button
                    key={p.value}
                    onClick={() => {
                      onOpenDropdownChange(null);
                      onInlineUpdate({ priority: p.value as Task['priority'] }, 'priority');
                    }}
                    className="w-full px-3 py-2 text-sm text-left hover:bg-navy-900 transition-colors"
                    style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
                  >
                    <span className={p.color}>{p.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Agency */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-navy-600 w-20 shrink-0">Agency</span>
          <div className="relative flex-1 text-right">
            <button
              onClick={() => onOpenDropdownChange(openDropdown === 'agency' ? null : 'agency')}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-sm text-slate-200 hover:bg-navy-800 transition-colors"
              style={{ touchAction: 'manipulation' }}
            >
              {task.agency || <span className="text-navy-600">None</span>}
            </button>
            {openDropdown === 'agency' && (
              <div className="absolute top-full right-0 mt-1 z-20 rounded-xl bg-[#142238] border border-navy-800 shadow-xl py-1 min-w-[140px] max-h-[240px] overflow-y-auto">
                <button
                  onClick={() => { onOpenDropdownChange(null); onInlineUpdate({ agency: null }, 'agency'); }}
                  className="w-full px-3 py-2 text-sm text-left text-navy-600 hover:bg-navy-900 transition-colors"
                  style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
                >
                  None
                </button>
                {AGENCIES.map(a => (
                  <button
                    key={a}
                    onClick={() => { onOpenDropdownChange(null); onInlineUpdate({ agency: a }, 'agency'); }}
                    className="w-full px-3 py-2 text-sm text-left text-slate-200 hover:bg-navy-900 transition-colors"
                    style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
                  >
                    {a}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Assignee */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-navy-600 w-20 shrink-0">Assignee</span>
          <div className="relative flex-1 text-right">
            <button
              onClick={() => onOpenDropdownChange(openDropdown === 'assignee' ? null : 'assignee')}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-sm text-slate-200 hover:bg-navy-800 transition-colors"
              style={{ touchAction: 'manipulation' }}
            >
              {task.owner_name || <span className="text-navy-600">Unassigned</span>}
            </button>
            {openDropdown === 'assignee' && (
              <div className="absolute top-full right-0 mt-1 z-20 rounded-xl bg-[#142238] border border-navy-800 shadow-xl py-1 min-w-[180px] max-h-[240px] overflow-y-auto">
                {users.map(u => (
                  <button
                    key={u.id}
                    onClick={() => {
                      onOpenDropdownChange(null);
                      if (u.id !== task.owner_user_id) {
                        onInlineUpdate({ owner_user_id: u.id, owner_name: u.name }, 'assignee');
                      }
                    }}
                    className={`w-full px-3 py-2 text-sm text-left hover:bg-navy-900 transition-colors ${u.id === task.owner_user_id ? 'text-gold-500' : 'text-slate-200'}`}
                    style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
                  >
                    {u.name}
                    {u.agency && <span className="text-xs text-navy-600 ml-1">({u.agency})</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Due Date */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-navy-600 w-20 shrink-0">Due Date</span>
          <input
            type="date"
            value={task.due_date?.split('T')[0] || ''}
            onChange={(e) => onInlineUpdate({ due_date: e.target.value || null }, 'due_date')}
            aria-label="Due date"
            className="bg-transparent text-sm text-slate-200 px-2 py-1 rounded hover:bg-navy-800 transition-colors border-none focus:outline-none focus:ring-1 focus:ring-gold-500/50 cursor-pointer"
            style={inputStyle}
          />
        </div>

        {/* Created */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-navy-600 w-20 shrink-0">Created</span>
          <span className="text-xs text-slate-400">
            {format(parseISO(task.created_at), 'MMM d')}
            {task.owner_name && <span className="text-navy-600"> by {task.owner_name.split(' ')[0]}</span>}
          </span>
        </div>
      </div>
    </div>
  );
}
