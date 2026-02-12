// Task status system — 4 simple statuses, any-to-any transitions.
// Safe for client AND server import (no React, no DB).

export type TaskStatus = 'new' | 'in_progress' | 'delayed' | 'done';

export const ALL_STATUSES: TaskStatus[] = ['new', 'in_progress', 'delayed', 'done'];

export const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string }> = {
  new: { label: 'New', color: 'bg-blue-500' },
  in_progress: { label: 'In Progress', color: 'bg-yellow-500' },
  delayed: { label: 'Delayed', color: 'bg-red-500' },
  done: { label: 'Done', color: 'bg-emerald-500' },
};

export function getValidTransitions(currentStatus: TaskStatus): TaskStatus[] {
  return ALL_STATUSES.filter(s => s !== currentStatus);
}

export function validateTransition(currentStatus: string, newStatus: string): boolean {
  return ALL_STATUSES.includes(newStatus as TaskStatus) && currentStatus !== newStatus;
}
