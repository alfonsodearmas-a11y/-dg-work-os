'use client';

import { useState, useRef, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { GripVertical, ChevronDown } from 'lucide-react';
import { TaskManagementCard, STATUS_LABELS } from './TaskManagementCard';
import type { TaskStatus } from '@/lib/task-transitions';
import { getValidTransitions } from '@/lib/task-transitions';

interface DraggableTaskCardProps {
  task: {
    id: string;
    title: string;
    status: string;
    priority: string;
    agency: string;
    assignee_name?: string;
    due_date?: string | null;
  };
  userRole: string;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
  onNavigate: (taskId: string) => void;
  compact?: boolean;
}

export function DraggableTaskCard({
  task,
  userRole,
  onStatusChange,
  onNavigate,
  compact,
}: DraggableTaskCardProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const validTransitions = getValidTransitions(task.status as TaskStatus, userRole);
  const canTransition = validTransitions.length > 0;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: task.id,
    data: { status: task.status, task },
    disabled: !canTransition,
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: 0.3 }
    : undefined;

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative ${isDragging ? 'z-50' : ''}`}
    >
      {/* Drag handle — visible on hover */}
      {canTransition && (
        <button
          {...attributes}
          {...listeners}
          className="absolute left-0 top-0 bottom-0 w-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing z-10"
          onClick={(e) => e.stopPropagation()}
          aria-label="Drag to move task"
        >
          <GripVertical className="h-3.5 w-3.5 text-[#64748b]" />
        </button>
      )}

      {/* Status dropdown trigger — visible on hover */}
      {canTransition && (
        <div ref={dropdownRef} className="absolute top-1.5 right-1.5 z-20">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDropdownOpen(!dropdownOpen);
            }}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-[#2d3a52] text-[#64748b] hover:text-white"
            aria-label="Change status"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-1 bg-[#1a2744] border border-[#2d3a52] rounded-lg shadow-xl py-1 min-w-[140px]">
              {validTransitions.map((status) => {
                const info = STATUS_LABELS[status];
                return (
                  <button
                    key={status}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDropdownOpen(false);
                      onStatusChange(task.id, status);
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#2d3a52]/50 transition-colors flex items-center gap-2"
                  >
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${info?.color?.split(' ')[0] || 'bg-gray-500'}`} />
                    <span className="text-[#c8d0dc]">{info?.label || status.replace('_', ' ')}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Card — offset slightly when drag handle is shown */}
      <div className={canTransition ? 'pl-3' : ''}>
        <TaskManagementCard
          task={task}
          onClick={() => onNavigate(task.id)}
          compact={compact}
        />
      </div>
    </div>
  );
}

export function DragOverlayCard({ task, compact }: { task: DraggableTaskCardProps['task']; compact?: boolean }) {
  return (
    <div className="rotate-2 scale-105 shadow-2xl opacity-90 pointer-events-none max-w-[250px]">
      <TaskManagementCard task={task} compact={compact} />
    </div>
  );
}
