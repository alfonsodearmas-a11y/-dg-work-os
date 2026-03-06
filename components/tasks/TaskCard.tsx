'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Calendar, CalendarPlus, GripVertical, MoreHorizontal } from 'lucide-react';
import { Task } from '@/lib/task-types';
import { TaskTooltip } from './TaskTooltip';
import { format, isToday, isPast, parseISO } from 'date-fns';

interface TaskCardProps {
  task: Task;
  isMobile: boolean;
  isDragging?: boolean;
  onOpenModal: () => void;
  onCalendar?: (task: Task) => void;
  onContextMenu: (task: Task, position: { x: number; y: number }) => void;
  onBottomSheet: (task: Task) => void;
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

const PRIORITY_BORDER: Record<string, string> = {
  critical: 'border-l-red-500',
  high: 'border-l-red-400',
  medium: 'border-l-amber-500',
  low: 'border-l-[#64748b]',
};

function getInitials(name: string | null): string {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export function TaskCard({ task, isMobile, isDragging, onOpenModal, onCalendar, onContextMenu, onBottomSheet }: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipRect, setTooltipRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clickCountRef = useRef(0);

  // Hover tooltip (desktop only, not when expanded)
  const handleMouseEnter = useCallback(() => {
    if (isMobile || expanded) return;
    hoverTimerRef.current = setTimeout(() => {
      if (cardRef.current) {
        setTooltipRect(cardRef.current.getBoundingClientRect());
        setShowTooltip(true);
      }
    }, 400);
  }, [isMobile, expanded]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setShowTooltip(false);
  }, []);

  // Click handling
  const handleClick = useCallback((e: React.MouseEvent) => {
    // Don't trigger if click came from a button inside
    if ((e.target as HTMLElement).closest('button')) return;

    if (isMobile) {
      setExpanded(prev => !prev);
      return;
    }

    // Desktop: single click = expand, double click = open modal
    clickCountRef.current += 1;
    if (clickCountRef.current === 1) {
      clickTimerRef.current = setTimeout(() => {
        if (clickCountRef.current === 1) {
          setExpanded(prev => !prev);
          setShowTooltip(false);
        }
        clickCountRef.current = 0;
      }, 250);
    } else if (clickCountRef.current >= 2) {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      clickCountRef.current = 0;
      setExpanded(false);
      setShowTooltip(false);
      onOpenModal();
    }
  }, [isMobile, onOpenModal]);

  // Right-click context menu (desktop)
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (isMobile) return;
    e.preventDefault();
    e.stopPropagation();
    setShowTooltip(false);
    onContextMenu(task, { x: e.clientX, y: e.clientY });
  }, [isMobile, task, onContextMenu]);

  // Long press (mobile)
  const handleTouchStart = useCallback(() => {
    longPressTimerRef.current = setTimeout(() => {
      onBottomSheet(task);
    }, 500);
  }, [task, onBottomSheet]);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
  }, []);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    };
  }, []);

  // Drag start (desktop only)
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    if (isMobile) { e.preventDefault(); return; }
    e.dataTransfer.setData('text/plain', task.id);
    e.dataTransfer.effectAllowed = 'move';
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
  const priorityBorder = task.priority ? PRIORITY_BORDER[task.priority] || '' : '';

  return (
    <>
      <div
        ref={cardRef}
        draggable={!isMobile}
        onDragStart={handleDragStart}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchEnd={cancelLongPress}
        onTouchMove={cancelLongPress}
        className={`group relative rounded-xl border bg-gradient-to-b from-[#1a2744] to-[#0f1d32] p-3 cursor-pointer
          hover:border-[#d4af37]/50 hover:shadow-lg hover:shadow-[#d4af37]/5 transition-all duration-200
          ${isDragging ? 'opacity-50 scale-105 shadow-2xl !border-[#d4af37]' : 'border-[#2d3a52]'}
          ${expanded ? `border-l-2 ${priorityBorder} !bg-[#1e2d4a]` : ''}`}
        style={{ touchAction: 'manipulation' }}
      >
        {/* Drag Handle (desktop only) */}
        {!isMobile && (
          <div
            className="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4 text-[#64748b]" />
          </div>
        )}

        {/* ··· Menu Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (isMobile) {
              onBottomSheet(task);
            } else {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              onContextMenu(task, { x: rect.right, y: rect.bottom });
            }
          }}
          className={`absolute right-2 top-2 p-1.5 rounded-lg text-[#64748b] hover:text-white hover:bg-[#2d3a52] transition-all z-10 ${
            isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          style={{ minWidth: 28, minHeight: 28, touchAction: 'manipulation' }}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>

        <div className={isMobile ? 'pr-8' : 'pl-4 pr-8'}>
          {/* Title row with priority dot */}
          <div className="flex items-start gap-2 mb-2">
            {task.priority && (
              <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${PRIORITY_DOT[task.priority] || PRIORITY_DOT.medium}`} />
            )}
            {expanded ? (
              <h4 className="text-white font-medium text-sm leading-snug flex-1">
                {task.title}
              </h4>
            ) : (
              <h4
                className="text-white font-medium text-sm flex-1"
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical' as const,
                  overflow: 'hidden',
                  lineHeight: '1.4',
                }}
              >
                {task.title}
              </h4>
            )}
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

          {/* Expanded: extra details */}
          {expanded && (
            <div className="space-y-1.5 mb-2 text-xs">
              {task.owner_name && (
                <p className="text-[#94a3b8]">Assigned to {task.owner_name}</p>
              )}
              {task.description && (
                <p className="text-[#64748b] leading-relaxed">
                  {task.description.length > 200 ? task.description.slice(0, 200) + '...' : task.description}
                </p>
              )}
              {task.blocked_reason && (
                <p className="text-amber-400">Blocked: {task.blocked_reason}</p>
              )}
            </div>
          )}

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
              {task.owner_name && !expanded && (
                <div className="w-5 h-5 rounded-full bg-[#2d3a52] flex items-center justify-center text-[9px] font-bold text-[#94a3b8] shrink-0" title={task.owner_name}>
                  {getInitials(task.owner_name)}
                </div>
              )}
              {onCalendar && !isMobile && (
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

      {/* Hover Tooltip (desktop only) */}
      {!isMobile && (
        <TaskTooltip task={task} cardRect={tooltipRect} visible={showTooltip} />
      )}
    </>
  );
}
