'use client';

import { useState, useRef, useEffect } from 'react';
import { Pencil, ArrowRight, Trash2 } from 'lucide-react';
import { Task, TaskStatus } from '@/lib/task-types';

interface TaskBottomSheetProps {
  task: Task;
  onClose: () => void;
  onEdit: () => void;
  onMove: (taskId: string, status: TaskStatus) => void;
  onDelete: (taskId: string) => void;
}

const STATUS_OPTIONS: { value: TaskStatus; label: string; dot: string }[] = [
  { value: 'new', label: 'New', dot: 'bg-indigo-400' },
  { value: 'active', label: 'Active', dot: 'bg-blue-400' },
  { value: 'blocked', label: 'Blocked', dot: 'bg-amber-400' },
  { value: 'done', label: 'Done', dot: 'bg-emerald-400' },
];

const NEXT_STATUS: Record<string, { label: string; value: TaskStatus }> = {
  new: { label: 'Move to Active', value: 'active' },
  active: { label: 'Move to Done', value: 'done' },
  blocked: { label: 'Move to Active', value: 'active' },
  done: { label: 'Reopen (New)', value: 'new' },
};

export function TaskBottomSheet({ task, onClose, onEdit, onMove, onDelete }: TaskBottomSheetProps) {
  const [view, setView] = useState<'actions' | 'move' | 'confirmDelete'>('actions');
  const nextStatus = NEXT_STATUS[task.status];
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (sheetRef.current) {
      const focusable = sheetRef.current.querySelector<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
      focusable?.focus();
    }
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Task actions"
        className="relative w-full rounded-t-2xl bg-gradient-to-b from-[#1a2744] to-[#0f1d32] border-t border-[#2d3a52] shadow-2xl animate-slide-up"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center py-3">
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>

        {view === 'actions' && (
          <div className="px-4 pb-3">
            {/* Task info */}
            <div className="mb-3 px-1">
              <p className="text-white text-sm font-medium line-clamp-1">{task.title}</p>
              <div className="flex items-center gap-2 text-xs text-[#64748b] mt-1">
                {task.agency && <span>{task.agency}</span>}
                {task.priority && <span className="capitalize">{task.priority}</span>}
                {task.due_date && (
                  <span>Due {new Date(task.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                )}
              </div>
            </div>

            <div className="border-t border-white/[0.06] mb-2" />

            <button
              onClick={() => { onEdit(); onClose(); }}
              className="w-full flex items-center gap-3 px-3 py-3.5 text-sm text-[#e2e8f0] rounded-lg active:bg-[#2d3a52]/50 transition-colors"
              style={{ minHeight: 44, touchAction: 'manipulation' }}
            >
              <Pencil className="h-4 w-4 text-[#64748b]" />
              Edit task
            </button>

            {nextStatus && (
              <button
                onClick={() => { onMove(task.id, nextStatus.value); onClose(); }}
                className="w-full flex items-center gap-3 px-3 py-3.5 text-sm text-[#e2e8f0] rounded-lg active:bg-[#2d3a52]/50 transition-colors"
                style={{ minHeight: 44, touchAction: 'manipulation' }}
              >
                <ArrowRight className="h-4 w-4 text-[#64748b]" />
                {nextStatus.label}
              </button>
            )}

            <button
              onClick={() => setView('move')}
              className="w-full flex items-center gap-3 px-3 py-3.5 text-sm text-[#e2e8f0] rounded-lg active:bg-[#2d3a52]/50 transition-colors"
              style={{ minHeight: 44, touchAction: 'manipulation' }}
            >
              <ArrowRight className="h-4 w-4 text-[#64748b]" />
              Move to...
            </button>

            <div className="border-t border-white/[0.06] my-1" />

            <button
              onClick={() => setView('confirmDelete')}
              className="w-full flex items-center gap-3 px-3 py-3.5 text-sm text-red-400 rounded-lg active:bg-red-500/10 transition-colors"
              style={{ minHeight: 44, touchAction: 'manipulation' }}
            >
              <Trash2 className="h-4 w-4" />
              Delete task
            </button>

            <button
              onClick={onClose}
              className="w-full mt-2 py-3.5 rounded-xl bg-[#2d3a52] text-sm font-medium text-[#94a3b8] active:bg-[#3d4a62]"
              style={{ minHeight: 44, touchAction: 'manipulation' }}
            >
              Cancel
            </button>
          </div>
        )}

        {view === 'move' && (
          <div className="px-4 pb-3">
            <p className="text-white text-sm font-medium mb-3 px-1">Move task to...</p>
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s.value}
                onClick={() => {
                  if (s.value !== task.status) onMove(task.id, s.value);
                  onClose();
                }}
                className={`w-full flex items-center gap-3 px-3 py-3.5 text-sm rounded-lg transition-colors ${
                  s.value === task.status
                    ? 'text-white bg-[#2d3a52]/60'
                    : 'text-[#e2e8f0] active:bg-[#2d3a52]/50'
                }`}
                style={{ minHeight: 44, touchAction: 'manipulation' }}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${s.dot}`} />
                {s.label}
                {s.value === task.status && (
                  <span className="ml-auto text-xs text-[#64748b]">current</span>
                )}
              </button>
            ))}
            <button
              onClick={() => setView('actions')}
              className="w-full mt-2 py-3.5 rounded-xl bg-[#2d3a52] text-sm font-medium text-[#94a3b8] active:bg-[#3d4a62]"
              style={{ minHeight: 44, touchAction: 'manipulation' }}
            >
              Back
            </button>
          </div>
        )}

        {view === 'confirmDelete' && (
          <div className="px-4 pb-3">
            <p className="text-white text-sm font-semibold mb-1 px-1">Delete this task?</p>
            <p className="text-[#64748b] text-xs mb-4 px-1">This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setView('actions')}
                className="flex-1 py-3.5 rounded-xl bg-[#2d3a52] text-sm font-medium text-[#94a3b8] active:bg-[#3d4a62]"
                style={{ minHeight: 44, touchAction: 'manipulation' }}
              >
                Cancel
              </button>
              <button
                onClick={() => { onDelete(task.id); onClose(); }}
                className="flex-1 py-3.5 rounded-xl bg-red-500/15 border border-red-500/30 text-sm font-medium text-red-400 active:bg-red-500/25"
                style={{ minHeight: 44, touchAction: 'manipulation' }}
              >
                Yes, delete
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
