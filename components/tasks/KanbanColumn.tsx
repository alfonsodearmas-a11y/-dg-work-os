'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Task } from '@/lib/task-types';
import { TaskCard } from './TaskCard';

interface KanbanColumnProps {
  id: string;
  title: string;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

const COLUMN_STYLES: Record<string, { dot: string; count: string }> = {
  'Not Started': {
    dot: 'bg-[#94a3b8]',
    count: 'bg-[#4a5568]/20 text-[#94a3b8]'
  },
  'In Progress': {
    dot: 'bg-blue-400',
    count: 'bg-blue-500/20 text-blue-400'
  },
  'Blocked': {
    dot: 'bg-amber-400',
    count: 'bg-amber-500/20 text-amber-400'
  },
  'Completed': {
    dot: 'bg-emerald-400',
    count: 'bg-emerald-500/20 text-emerald-400'
  }
};

export function KanbanColumn({ id, title, tasks, onTaskClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  const styles = COLUMN_STYLES[title] || COLUMN_STYLES['Not Started'];

  return (
    <div className="flex-1 min-w-[280px] max-w-[320px]">
      {/* Column Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${styles.dot}`} />
          <h3 className="text-white font-semibold text-sm">{title}</h3>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles.count}`}>
          {tasks.length}
        </span>
      </div>

      {/* Tasks Container */}
      <div
        ref={setNodeRef}
        className={`space-y-2 p-2 rounded-xl min-h-[200px] transition-colors duration-200 ${
          isOver
            ? 'bg-[#d4af37]/10 border-2 border-dashed border-[#d4af37]/50'
            : 'bg-[#0a1628]/50 border-2 border-transparent'
        }`}
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onClick={() => onTaskClick(task)}
            />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <div className="flex items-center justify-center h-24 text-[#64748b] text-sm">
            No tasks
          </div>
        )}
      </div>
    </div>
  );
}
