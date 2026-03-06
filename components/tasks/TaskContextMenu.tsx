'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, ArrowRight, Trash2 } from 'lucide-react';
import { Task, TaskStatus } from '@/lib/task-types';

interface TaskContextMenuProps {
  task: Task;
  position: { x: number; y: number };
  onClose: () => void;
  onEdit: () => void;
  onMove: (taskId: string, status: TaskStatus) => void;
  onDelete: (taskId: string) => void;
}

const NEXT_STATUS: Record<string, { label: string; value: TaskStatus }> = {
  new: { label: 'Move to Active', value: 'active' },
  active: { label: 'Move to Done', value: 'done' },
  blocked: { label: 'Move to Active', value: 'active' },
  done: { label: 'Reopen (New)', value: 'new' },
};

export function TaskContextMenu({ task, position, onClose, onEdit, onMove, onDelete }: TaskContextMenuProps) {
  const [confirming, setConfirming] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleClick = () => onClose();
    document.addEventListener('keydown', handleEscape);
    const timer = setTimeout(() => document.addEventListener('mousedown', handleClick), 10);
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClick);
      clearTimeout(timer);
    };
  }, [onClose]);

  if (!mounted) return null;

  const nextStatus = NEXT_STATUS[task.status];
  const menuWidth = 200;
  const menuHeight = confirming ? 130 : 156;
  const x = Math.min(position.x, window.innerWidth - menuWidth - 8);
  const y = Math.min(position.y, window.innerHeight - menuHeight - 8);

  return createPortal(
    <div
      style={{ position: 'fixed', left: x, top: y, zIndex: 9999, minWidth: menuWidth }}
      className="rounded-xl bg-[#142238] border border-[#d4af37]/15 shadow-[0_8px_24px_rgba(0,0,0,0.4)] py-1 animate-fade-in"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {!confirming ? (
        <>
          <button
            onClick={() => { onEdit(); onClose(); }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-[#e2e8f0] hover:bg-[#1a2744] transition-colors text-left"
          >
            <Pencil className="h-3.5 w-3.5 text-[#64748b] shrink-0" />
            Edit
          </button>
          {nextStatus && (
            <button
              onClick={() => { onMove(task.id, nextStatus.value); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-[#e2e8f0] hover:bg-[#1a2744] transition-colors text-left"
            >
              <ArrowRight className="h-3.5 w-3.5 text-[#64748b] shrink-0" />
              {nextStatus.label}
            </button>
          )}
          <div className="mx-2 my-1 border-t border-white/[0.06]" />
          <button
            onClick={() => setConfirming(true)}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors text-left"
          >
            <Trash2 className="h-3.5 w-3.5 shrink-0" />
            Delete task
          </button>
        </>
      ) : (
        <div className="px-3.5 py-2.5">
          <p className="text-xs font-semibold text-white mb-1">Delete this task?</p>
          <p className="text-[11px] text-[#64748b] mb-3">This cannot be undone.</p>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirming(false)}
              className="flex-1 px-3 py-1.5 rounded-lg text-xs text-[#94a3b8] hover:text-white hover:bg-[#2d3a52] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => { onDelete(task.id); onClose(); }}
              className="flex-1 px-3 py-1.5 rounded-lg text-xs text-red-400 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition-colors"
            >
              Yes, delete
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
