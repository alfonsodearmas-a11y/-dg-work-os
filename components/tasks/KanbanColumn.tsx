'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Task, TaskStatus } from '@/lib/task-types';
import { TaskCard } from './TaskCard';

interface UserOption {
  id: string;
  name: string;
  role: string;
  agency: string | null;
}

interface KanbanColumnProps {
  id: string;
  title: string;
  tasks: Task[];
  isMobile: boolean;
  draggingId: string | null;
  selectedIds: Set<string>;
  selectionMode: boolean;
  onToggleSelect: (id: string) => void;
  onOpenModal: (task: Task) => void;
  onCalendar?: (task: Task) => void;
  onDrop: (taskId: string, targetColumn: string) => void;
  onContextMenu: (task: Task, position: { x: number; y: number }) => void;
  onBottomSheet: (task: Task) => void;
  onQuickAdd?: (status: TaskStatus) => void;
}

const COLUMN_STYLES: Record<string, { dot: string; count: string }> = {
  'New': {
    dot: 'bg-indigo-400',
    count: 'bg-indigo-500/20 text-indigo-400'
  },
  'Active': {
    dot: 'bg-blue-400',
    count: 'bg-blue-500/20 text-blue-400'
  },
  'Blocked': {
    dot: 'bg-amber-400',
    count: 'bg-amber-500/20 text-amber-400'
  },
  'Done': {
    dot: 'bg-emerald-400',
    count: 'bg-emerald-500/20 text-emerald-400'
  }
};

export function KanbanColumn({
  id, title, tasks, isMobile, draggingId,
  selectedIds, selectionMode, onToggleSelect,
  onOpenModal, onCalendar, onDrop, onContextMenu, onBottomSheet,
  onQuickAdd,
}: KanbanColumnProps) {
  const [isOver, setIsOver] = useState(false);

  const styles = COLUMN_STYLES[title] || COLUMN_STYLES['New'];

  const allSelected = tasks.length > 0 && tasks.every(t => selectedIds.has(t.id));

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsOver(false);
    const taskId = e.dataTransfer.getData('text/plain');
    if (taskId) {
      onDrop(taskId, id);
    }
  };

  const handleSelectAll = () => {
    if (allSelected) {
      tasks.forEach(t => { if (selectedIds.has(t.id)) onToggleSelect(t.id); });
    } else {
      tasks.forEach(t => { if (!selectedIds.has(t.id)) onToggleSelect(t.id); });
    }
  };

  return (
    <div className={isMobile ? 'w-full' : 'flex-1 min-w-[280px] max-w-[320px]'}>
      {/* Column Header (hidden on mobile — tab bar handles it) */}
      {!isMobile && (
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            {selectionMode && (
              <input
                type="checkbox"
                checked={allSelected}
                onChange={handleSelectAll}
                aria-label={`Select all ${title} tasks`}
                className="w-4 h-4 rounded border-navy-800 accent-gold-500 cursor-pointer"
              />
            )}
            <div className={`w-2 h-2 rounded-full ${styles.dot}`} />
            <h3 className="text-white font-semibold text-sm">{title}</h3>
          </div>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles.count}`}>
            {tasks.length}
          </span>
        </div>
      )}

      {/* Tasks Container */}
      <div
        {...(!isMobile ? {
          onDragOver: handleDragOver,
          onDragLeave: handleDragLeave,
          onDrop: handleDrop,
        } : {})}
        className={`space-y-2 p-2 rounded-xl min-h-[200px] transition-colors duration-200 ${
          isOver
            ? 'bg-gold-500/10 border-2 border-dashed border-gold-500/50'
            : isMobile ? '' : 'bg-navy-950/50 border-2 border-transparent'
        }`}
      >
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            isMobile={isMobile}
            isDragging={draggingId === task.id}
            isSelected={selectedIds.has(task.id)}
            selectionMode={selectionMode}
            onToggleSelect={onToggleSelect}
            onOpenModal={() => onOpenModal(task)}
            onCalendar={onCalendar}
            onContextMenu={onContextMenu}
            onBottomSheet={onBottomSheet}
          />
        ))}

        {tasks.length === 0 && (
          <div className="flex items-center justify-center h-24 text-navy-600 text-sm">
            No tasks
          </div>
        )}

        {/* Quick Add button at bottom of column */}
        {!isMobile && onQuickAdd && (
          <button
            onClick={() => onQuickAdd(id as TaskStatus)}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs text-navy-600 hover:text-gold-500 hover:bg-gold-500/5 border border-transparent hover:border-gold-500/20 transition-all"
          >
            <Plus className="h-3.5 w-3.5" />
            Add task
          </button>
        )}
      </div>
    </div>
  );
}
