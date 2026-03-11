'use client';

import { useRef } from 'react';
import { X } from 'lucide-react';
import { Task, TaskStatus, TaskUpdate } from '@/lib/task-types';

export const STATUSES: { value: TaskStatus; label: string; dot: string }[] = [
  { value: 'new', label: 'New', dot: 'bg-indigo-400' },
  { value: 'active', label: 'Active', dot: 'bg-blue-400' },
  { value: 'blocked', label: 'Blocked', dot: 'bg-amber-400' },
  { value: 'done', label: 'Done', dot: 'bg-emerald-400' },
];

export const STATUS_PILLS: Record<string, string> = {
  new: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  active: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  blocked: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  done: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
};

interface TaskHeaderProps {
  task: Task;
  isMobile: boolean;
  editingTitle: boolean;
  titleValue: string;
  savedFlash: string;
  openDropdown: string | null;
  onEditingTitleChange: (editing: boolean) => void;
  onTitleValueChange: (value: string) => void;
  onOpenDropdownChange: (dropdown: string | null) => void;
  onInlineUpdate: (updates: TaskUpdate, field: string) => void;
  onClose: () => void;
}

export function TaskHeader({
  task,
  isMobile,
  editingTitle,
  titleValue,
  savedFlash,
  openDropdown,
  onEditingTitleChange,
  onTitleValueChange,
  onOpenDropdownChange,
  onInlineUpdate,
  onClose,
}: TaskHeaderProps) {
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const inputStyle: React.CSSProperties = isMobile ? { minHeight: 44, fontSize: 16 } : {};
  const statusPill = STATUS_PILLS[task.status] || STATUS_PILLS.new;

  const handleTitleBlur = () => {
    onEditingTitleChange(false);
    if (titleValue !== task.title && titleValue.trim()) {
      onInlineUpdate({ title: titleValue }, 'title');
    }
  };

  return (
    <div className="flex items-start justify-between p-4 border-b border-navy-800 shrink-0">
      <div className="flex-1 min-w-0 pr-2">
        {editingTitle ? (
          <textarea
            ref={titleRef}
            value={titleValue}
            onChange={(e) => onTitleValueChange(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleTitleBlur(); } }}
            autoFocus
            aria-label="Task title"
            className="w-full bg-transparent text-white text-lg font-semibold leading-snug resize-none border-b border-gold-500/50 focus:outline-none"
            rows={2}
            style={{ ...inputStyle, overflow: 'hidden' }}
          />
        ) : (
          <h2
            id="task-detail-panel-title"
            className="text-lg font-semibold text-white leading-snug cursor-pointer hover:text-gold-500 transition-colors"
            onClick={() => { onEditingTitleChange(true); setTimeout(() => titleRef.current?.focus(), 0); }}
          >
            {task.title}
          </h2>
        )}
        {/* Status pill */}
        <div className="relative mt-2">
          <button
            onClick={() => onOpenDropdownChange(openDropdown === 'status' ? null : 'status')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border capitalize transition-colors ${statusPill}`}
            style={{ touchAction: 'manipulation' }}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${STATUSES.find(s => s.value === task.status)?.dot || ''}`} />
            {task.status}
          </button>
          {openDropdown === 'status' && (
            <div className="absolute top-full left-0 mt-1 z-20 rounded-xl bg-[#142238] border border-navy-800 shadow-xl py-1 min-w-[140px]">
              {STATUSES.map(s => (
                <button
                  key={s.value}
                  onClick={() => {
                    onOpenDropdownChange(null);
                    if (s.value !== task.status) {
                      onInlineUpdate({ status: s.value }, 'status');
                    }
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                    s.value === task.status ? 'text-white bg-navy-800/60' : 'text-slate-200 hover:bg-navy-900'
                  }`}
                  style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
                >
                  <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {savedFlash && (
          <span className="text-xs text-emerald-400 mt-1 inline-block animate-fade-in">Saved</span>
        )}
      </div>
      <button
        onClick={onClose}
        aria-label="Close"
        className="p-2 rounded-lg text-navy-600 hover:text-white hover:bg-navy-800 transition-colors shrink-0"
        style={{ minWidth: isMobile ? 44 : undefined, minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}
