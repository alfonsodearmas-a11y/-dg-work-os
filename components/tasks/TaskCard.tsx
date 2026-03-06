'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, CalendarPlus, GripVertical } from 'lucide-react';
import { Task } from '@/lib/task-types';
import { format, isToday, isPast, parseISO } from 'date-fns';

interface TaskCardProps {
  task: Task;
  onClick: () => void;
  onCalendar?: (task: Task) => void;
}

const AGENCY_COLORS: Record<string, string> = {
  'GPL': 'border-[#4a82f5]/40 bg-[#4a82f5]/15 text-[#4a82f5]',
  'GWI': 'border-[#00c875]/40 bg-[#00c875]/15 text-[#00c875]',
  'GCAA': 'border-[#a25ddc]/40 bg-[#a25ddc]/15 text-[#a25ddc]',
  'CJIA': 'border-[#fb9d3b]/40 bg-[#fb9d3b]/15 text-[#fb9d3b]',
  'HECI': 'border-[#579bfc]/40 bg-[#579bfc]/15 text-[#579bfc]',
  'MARAD': 'border-[#00cec9]/40 bg-[#00cec9]/15 text-[#00cec9]',
  'Hinterland': 'border-[#2da44e]/40 bg-[#2da44e]/15 text-[#2da44e]',
  'HAS': 'border-orange-500/40 bg-orange-500/15 text-orange-400',
  'Ministry': 'border-indigo-500/40 bg-indigo-500/15 text-indigo-400',
};

const PRIORITY_DOT: Record<string, string> = {
  critical: 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]',
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-[#64748b]',
};

function getInitials(name: string | null): string {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export function TaskCard({ task, onClick, onCalendar }: TaskCardProps) {
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
    if (task.status !== 'done' && isPast(date) && !isToday(date)) return 'text-red-400';
    if (isToday(date)) return 'text-[#d4af37]';
    return 'text-[#64748b]';
  };

  const formatDueDate = () => {
    if (!task.due_date) return null;
    const date = parseISO(task.due_date);
    if (isToday(date)) return 'Today';
    return format(date, 'MMM d');
  };

  const isOverdue = task.due_date && task.status !== 'done' && isPast(parseISO(task.due_date)) && !isToday(parseISO(task.due_date));

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
        {/* Title row with priority dot */}
        <div className="flex items-start gap-2 mb-2">
          {task.priority && (
            <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${PRIORITY_DOT[task.priority] || PRIORITY_DOT.medium}`} />
          )}
          <h4 className="text-white font-medium text-sm leading-tight line-clamp-2 flex-1">
            {task.title}
          </h4>
        </div>

        {/* Badges Row */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {task.agency && (
            <span className={`px-2 py-0.5 rounded text-xs font-medium border ${AGENCY_COLORS[task.agency] || 'bg-[#2d3a52] text-[#94a3b8] border-[#3d4a62]'}`}>
              {task.agency}
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
                {isOverdue && <span className="text-red-400">↑</span>}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {task.owner_name && (
              <div className="w-5 h-5 rounded-full bg-[#2d3a52] flex items-center justify-center text-[9px] font-bold text-[#94a3b8] shrink-0" title={task.owner_name}>
                {getInitials(task.owner_name)}
              </div>
            )}
            {onCalendar && (
              <button
                onClick={(e) => { e.stopPropagation(); onCalendar(task); }}
                onMouseDown={(e) => e.stopPropagation()}
                className="p-1 rounded text-[#64748b] hover:text-[#d4af37] hover:bg-[#d4af37]/10 transition-colors opacity-0 group-hover:opacity-100"
                title="Add to Calendar"
              >
                <CalendarPlus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
