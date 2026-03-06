'use client';

import { useState } from 'react';
import { Task } from '@/lib/task-types';
import { TaskCard } from './TaskCard';

interface KanbanColumnProps {
  id: string;
  title: string;
  tasks: Task[];
  draggingId: string | null;
  onTaskClick: (task: Task) => void;
  onCalendar?: (task: Task) => void;
  onDrop: (taskId: string, targetColumn: string) => void;
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

export function KanbanColumn({ id, title, tasks, draggingId, onTaskClick, onCalendar, onDrop }: KanbanColumnProps) {
  const [isOver, setIsOver] = useState(false);

  const styles = COLUMN_STYLES[title] || COLUMN_STYLES['New'];

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    // Only trigger if leaving the column container itself, not a child
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
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`space-y-2 p-2 rounded-xl min-h-[200px] transition-colors duration-200 ${
          isOver
            ? 'bg-[#d4af37]/10 border-2 border-dashed border-[#d4af37]/50'
            : 'bg-[#0a1628]/50 border-2 border-transparent'
        }`}
      >
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onClick={() => onTaskClick(task)}
            onCalendar={onCalendar}
            isDragging={draggingId === task.id}
          />
        ))}

        {tasks.length === 0 && (
          <div className="flex items-center justify-center h-24 text-[#64748b] text-sm">
            No tasks
          </div>
        )}
      </div>
    </div>
  );
}
