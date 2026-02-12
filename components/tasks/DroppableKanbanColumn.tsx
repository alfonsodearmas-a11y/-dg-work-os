'use client';

import { useDroppable } from '@dnd-kit/core';
import type { LucideIcon } from 'lucide-react';

interface DroppableKanbanColumnProps {
  status: string;
  label: string;
  icon: LucideIcon;
  borderColor: string;
  count: number;
  isValidDrop: boolean;
  isDragActive: boolean;
  isOver: boolean;
  children: React.ReactNode;
}

export function DroppableKanbanColumn({
  status,
  label,
  icon: Icon,
  borderColor,
  count,
  isValidDrop,
  isDragActive,
  children,
}: DroppableKanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  let containerClass = `bg-[#0f1d32] rounded-xl border-t-2 ${borderColor} min-h-[300px] transition-all duration-200`;

  if (isDragActive) {
    if (isValidDrop && isOver) {
      // Hovering over a valid column
      containerClass += ' ring-2 ring-[#d4af37] bg-[#d4af37]/5';
    } else if (isValidDrop) {
      // Valid target but not hovering
      containerClass += ' ring-1 ring-[#d4af37]/30';
    } else {
      // Invalid target
      containerClass += ' opacity-40';
    }
  }

  return (
    <div ref={setNodeRef} className={containerClass}>
      <div className="px-3 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 text-[#64748b]" />
          <span className="text-xs font-semibold text-[#64748b] uppercase tracking-wide">{label}</span>
        </div>
        <span className="text-xs text-[#64748b] bg-[#1a2744] px-1.5 py-0.5 rounded">{count}</span>
      </div>
      <div className="px-2 pb-2 space-y-2">
        {children}
        {count === 0 && (
          <p className="text-center text-xs text-[#64748b]/50 py-8">
            {isDragActive && isValidDrop ? 'Drop here' : 'No tasks'}
          </p>
        )}
      </div>
    </div>
  );
}
