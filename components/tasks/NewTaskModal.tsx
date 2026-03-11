'use client';

import { useRef, useEffect } from 'react';
import { Plus, X, FileText, Loader2 } from 'lucide-react';
import { TaskTemplate } from '@/lib/task-types';

const AGENCIES = ['GPL', 'GWI', 'HECI', 'CJIA', 'MARAD', 'GCAA', 'HAS', 'Hinterland', 'Ministry'];
const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;

interface UserOption {
  id: string;
  name: string;
  role: string;
  agency: string | null;
}

interface NewTaskModalProps {
  isOpen: boolean;
  isMobile: boolean;
  title: string;
  description: string;
  agency: string;
  priority: string;
  dueDate: string;
  assignee: string;
  users: UserOption[];
  templates: TaskTemplate[];
  showTemplates: boolean;
  creating: boolean;
  onTitleChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onAgencyChange: (v: string) => void;
  onPriorityChange: (v: string) => void;
  onDueDateChange: (v: string) => void;
  onAssigneeChange: (v: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  onLoadTemplates: () => void;
  onApplyTemplate: (template: TaskTemplate) => void;
}

export function NewTaskModal({
  isOpen,
  isMobile,
  title,
  description,
  agency,
  priority,
  dueDate,
  assignee,
  users,
  templates,
  showTemplates,
  creating,
  onTitleChange,
  onDescriptionChange,
  onAgencyChange,
  onPriorityChange,
  onDueDateChange,
  onAssigneeChange,
  onClose,
  onSubmit,
  onLoadTemplates,
  onApplyTemplate,
}: NewTaskModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const el = dialogRef.current;
    if (el) {
      const focusable = el.querySelector<HTMLElement>('input, button, select, textarea, [tabindex]:not([tabindex="-1"])');
      focusable?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const formContent = (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 id="new-task-modal-title" className="text-white font-medium text-sm">New Task</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={onLoadTemplates}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white bg-navy-950 border border-navy-800 hover:border-gold-500/50 transition-colors"
            style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
          >
            <FileText className="h-3.5 w-3.5" />
            Use Template
          </button>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-navy-600 hover:text-white hover:bg-navy-800 transition-colors"
            style={{ minWidth: isMobile ? 44 : undefined, minHeight: isMobile ? 44 : undefined }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {showTemplates && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-3 rounded-lg bg-navy-950 border border-navy-800">
          {templates.length === 0 && (
            <p className="text-navy-600 text-sm col-span-full">Loading templates...</p>
          )}
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => onApplyTemplate(t)}
              className="text-left p-3 rounded-lg bg-navy-900 border border-navy-800 hover:border-gold-500/50 transition-colors"
              style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
            >
              <p className="text-white text-sm font-medium">{t.name}</p>
              {t.description && (
                <p className="text-navy-600 text-xs mt-1 line-clamp-2">{t.description}</p>
              )}
              {t.agency_slug && (
                <span className="inline-block mt-1.5 px-1.5 py-0.5 rounded text-xs font-medium bg-navy-800 text-slate-400">
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
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && onSubmit()}
        autoFocus
        aria-label="Task title"
        aria-required="true"
        className="w-full px-3 py-2.5 rounded-lg bg-navy-950 border border-navy-800 text-white placeholder-navy-600 focus:outline-none focus:border-gold-500"
        style={{ minHeight: isMobile ? 44 : undefined, fontSize: isMobile ? 16 : undefined }}
      />

      <textarea
        placeholder="Description (optional)..."
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        rows={2}
        aria-label="Task description"
        className="w-full px-3 py-2.5 rounded-lg bg-navy-950 border border-navy-800 text-white placeholder-navy-600 focus:outline-none focus:border-gold-500 resize-none"
        style={{ minHeight: isMobile ? 80 : undefined, fontSize: isMobile ? 16 : undefined }}
      />

      <div className={`grid gap-2 ${isMobile ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-4'}`}>
        <select
          value={agency}
          onChange={(e) => onAgencyChange(e.target.value)}
          aria-label="Agency"
          className="px-3 py-2.5 rounded-lg bg-navy-950 border border-navy-800 text-white text-sm focus:outline-none focus:border-gold-500"
          style={{ minHeight: isMobile ? 44 : undefined }}
        >
          <option value="">No Agency</option>
          {AGENCIES.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        <select
          value={priority}
          onChange={(e) => onPriorityChange(e.target.value)}
          aria-label="Priority"
          className="px-3 py-2.5 rounded-lg bg-navy-950 border border-navy-800 text-white text-sm focus:outline-none focus:border-gold-500"
          style={{ minHeight: isMobile ? 44 : undefined }}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
          ))}
        </select>

        <input
          type="date"
          value={dueDate}
          onChange={(e) => onDueDateChange(e.target.value)}
          aria-label="Due date"
          className="px-3 py-2.5 rounded-lg bg-navy-950 border border-navy-800 text-white text-sm focus:outline-none focus:border-gold-500"
          style={{ minHeight: isMobile ? 44 : undefined }}
        />

        <select
          value={assignee}
          onChange={(e) => onAssigneeChange(e.target.value)}
          aria-label="Assignee"
          className="px-3 py-2.5 rounded-lg bg-navy-950 border border-navy-800 text-white text-sm focus:outline-none focus:border-gold-500"
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

  if (isMobile) {
    return (
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="new-task-mobile-title" className="fixed inset-0 z-50 flex flex-col bg-navy-950">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-b border-navy-800">
          <h2 id="new-task-mobile-title" className="text-lg font-semibold text-white">New Task</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-lg text-navy-600 hover:text-white"
            style={{ minWidth: 44, minHeight: 44, touchAction: 'manipulation' }}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {formContent}
        </div>
        <div className="px-4 py-3 border-t border-navy-800" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          <button
            onClick={() => onSubmit()}
            disabled={!title.trim() || creating}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gold-500 text-navy-950 font-semibold hover:bg-[#c9a432] transition-colors disabled:opacity-50"
            style={{ minHeight: 48, touchAction: 'manipulation' }}
          >
            {creating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
            Create Task
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={dialogRef} role="dialog" aria-labelledby="new-task-modal-title" className="p-4 rounded-xl bg-navy-900 border border-gold-500/50">
      {formContent}
      <div className="flex justify-end gap-2 mt-3">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-navy-800 transition-colors text-sm"
        >
          Cancel
        </button>
        <button
          onClick={() => onSubmit()}
          disabled={!title.trim() || creating}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gold-500 text-navy-950 font-medium hover:bg-[#c9a432] transition-colors disabled:opacity-50 text-sm"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Create
        </button>
      </div>
    </div>
  );
}
