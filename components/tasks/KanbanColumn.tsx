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
  visibleCount?: number;
  onShowMore?: () => void;
  /** W14 / W10 — when active, swap "No tasks" for "No matches" + Clear filters,
   *  and hide the "+ Add task" CTA so users don't silently create tasks that
   *  the filter immediately hides. */
  filtersActive?: boolean;
  onClearFilters?: () => void;
}

import { STATUS_DOT, STATUS_PILL } from '@/lib/constants/task-styles';

const COLUMN_STYLES: Record<string, { dot: string; count: string }> = {
  'New': { dot: STATUS_DOT.new, count: STATUS_PILL.new },
  'Active': { dot: STATUS_DOT.active, count: STATUS_PILL.active },
  'Blocked': { dot: STATUS_DOT.blocked, count: STATUS_PILL.blocked },
  'Done': { dot: STATUS_DOT.done, count: STATUS_PILL.done },
};

export function KanbanColumn({
  id, title, tasks, isMobile, draggingId,
  selectedIds, selectionMode, onToggleSelect,
  onOpenModal, onCalendar, onDrop, onContextMenu, onBottomSheet,
  onQuickAdd, visibleCount, onShowMore,
  filtersActive, onClearFilters,
}: KanbanColumnProps) {
  const [isOver, setIsOver] = useState(false);

  const styles = COLUMN_STYLES[title] || COLUMN_STYLES['New'];

  const visibleTasks = visibleCount != null ? tasks.slice(0, visibleCount) : tasks;
  const hiddenCount = tasks.length - visibleTasks.length;

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
            {hiddenCount > 0 ? `${visibleTasks.length}/${tasks.length}` : tasks.length}
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
        {visibleTasks.map((task) => (
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

        {hiddenCount > 0 && onShowMore && (
          <button
            onClick={onShowMore}
            className="w-full py-2 rounded-lg text-xs text-navy-600 hover:text-gold-500 hover:bg-gold-500/5 border border-dashed border-navy-800 hover:border-gold-500/20 transition-all"
            style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
          >
            Show {hiddenCount} more
          </button>
        )}

        {tasks.length === 0 && (
          filtersActive ? (
            <div className="flex flex-col items-center justify-center gap-2 h-32 text-white/30 text-sm px-3 text-center">
              <span>No matches</span>
              {onClearFilters && (
                <button
                  onClick={onClearFilters}
                  className="px-3 py-1.5 rounded-lg text-xs text-gold-500 border border-gold-500/30 hover:bg-gold-500/10 transition-colors"
                  style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-24 text-white/30 text-sm">
              No tasks
            </div>
          )
        )}

        {/* Quick Add button at bottom of column — hidden when filters/search are
            active so users don't silently create tasks that immediately fall
            outside the visible set (W14 / W10). */}
        {!isMobile && onQuickAdd && !filtersActive && (
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
