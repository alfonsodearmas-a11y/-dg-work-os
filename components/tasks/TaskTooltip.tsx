'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Task } from '@/lib/task-types';

const TOOLTIP_WIDTH = 260;

const PRIORITY_LABELS: Record<string, { label: string; dot: string }> = {
  critical: { label: 'Critical', dot: 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]' },
  high: { label: 'High', dot: 'bg-red-500' },
  medium: { label: 'Medium', dot: 'bg-amber-500' },
  low: { label: 'Low', dot: 'bg-[#64748b]' },
};

interface TaskTooltipProps {
  task: Task;
  cardRect: DOMRect | null;
  visible: boolean;
}

export function TaskTooltip({ task, cardRect, visible }: TaskTooltipProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  if (!mounted || !visible || !cardRect) return null;

  // Position calculation
  const spaceRight = window.innerWidth - cardRect.right;
  const spaceLeft = cardRect.left;

  let style: React.CSSProperties = {
    position: 'fixed',
    width: TOOLTIP_WIDTH,
    zIndex: 9999,
  };

  if (spaceRight >= TOOLTIP_WIDTH + 12) {
    style = { ...style, left: cardRect.right + 8, top: cardRect.top };
  } else if (spaceLeft >= TOOLTIP_WIDTH + 12) {
    style = { ...style, left: cardRect.left - TOOLTIP_WIDTH - 8, top: cardRect.top };
  } else {
    style = { ...style, left: cardRect.left, bottom: window.innerHeight - cardRect.top + 8 };
  }

  // Clamp top so it doesn't go off screen
  if (style.top !== undefined && typeof style.top === 'number') {
    style.top = Math.max(8, Math.min(style.top, window.innerHeight - 200));
  }

  const priority = task.priority ? PRIORITY_LABELS[task.priority] : null;

  return createPortal(
    <div
      style={style}
      className="rounded-xl bg-[#1a2744] border border-[#2d3a52] shadow-2xl p-3 space-y-2 pointer-events-none animate-fade-in"
    >
      <h4 className="text-white font-medium text-sm leading-snug">{task.title}</h4>

      <div className="flex flex-wrap gap-1.5">
        {priority && (
          <span className="flex items-center gap-1 text-xs text-[#94a3b8]">
            <span className={`w-2 h-2 rounded-full ${priority.dot}`} />
            {priority.label}
          </span>
        )}
        {task.agency && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#2d3a52] text-[#94a3b8]">
            {task.agency}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 text-xs text-[#64748b]">
        {task.owner_name && <span>{task.owner_name}</span>}
        {task.due_date && (
          <span>
            Due {new Date(task.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </span>
        )}
      </div>

      {task.description && (
        <p className="text-xs text-[#64748b] leading-relaxed">
          {task.description.length > 120 ? task.description.slice(0, 120) + '...' : task.description}
        </p>
      )}

      {task.blocked_reason && (
        <p className="text-xs text-amber-400">Blocked: {task.blocked_reason}</p>
      )}
    </div>,
    document.body
  );
}
