'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, GripVertical, User } from 'lucide-react';
import { Task } from '@/lib/task-types';
import { format, isToday, isPast, parseISO } from 'date-fns';

interface TaskCardProps {
  task: Task;
  onClick: () => void;
}

const AGENCY_COLORS: Record<string, string> = {
  'GPL': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'GWI': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'HECI': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'CJIA': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'MARAD': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  'GCAA': 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  'HAS': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'Ministry': 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-500/20 text-red-400',
  high: 'bg-amber-500/20 text-amber-400',
  medium: 'bg-blue-500/20 text-blue-400',
  low: 'bg-[#4a5568]/20 text-[#94a3b8]',
};

export function TaskCard({ task, onClick }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const getDueDateColor = () => {
    if (!task.due_date) return 'text-[#64748b]';
    const date = parseISO(task.due_date);
    if (isPast(date) && !isToday(date)) return 'text-red-400';
    if (isToday(date)) return 'text-[#d4af37]';
    return 'text-[#64748b]';
  };

  const formatDueDate = () => {
    if (!task.due_date) return null;
    const date = parseISO(task.due_date);
    if (isToday(date)) return 'Today';
    return format(date, 'MMM d');
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative rounded-xl border border-[#2d3a52] bg-gradient-to-b from-[#1a2744] to-[#0f1d32] p-3 cursor-pointer
        hover:border-[#d4af37]/50 hover:shadow-lg hover:shadow-[#d4af37]/5 transition-all duration-200
        ${isDragging ? 'opacity-50 scale-105 shadow-2xl border-[#d4af37]' : ''}`}
      onClick={onClick}
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-4 w-4 text-[#64748b]" />
      </div>

      <div className="pl-4">
        {/* Title */}
        <h4 className="text-white font-medium text-sm leading-tight mb-2 line-clamp-2">
          {task.title}
        </h4>

        {/* Badges Row */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {task.agency && (
            <span className={`px-2 py-0.5 rounded text-xs font-medium border ${AGENCY_COLORS[task.agency] || 'bg-[#2d3a52] text-[#94a3b8] border-[#3d4a62]'}`}>
              {task.agency}
            </span>
          )}
          {task.priority && (
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_COLORS[task.priority]}`}>
              {task.priority}
            </span>
          )}
          {task.role && (
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#2d3a52] text-[#94a3b8]">
              {task.role}
            </span>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            {task.due_date && (
              <div className={`flex items-center gap-1 ${getDueDateColor()}`}>
                <Calendar className="h-3 w-3" />
                <span>{formatDueDate()}</span>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
