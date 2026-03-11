// Task status system — 4 simple statuses, any-to-any transitions.
// Safe for client AND server import (no React, no DB).
// Canonical types come from task-types.ts; re-exported here for convenience.

import type { TaskStatus } from './task-types';

export type { TaskStatus };

export const ALL_STATUSES: TaskStatus[] = ['new', 'active', 'blocked', 'done'];

export const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string }> = {
  new: { label: 'New', color: 'bg-blue-500' },
  active: { label: 'Active', color: 'bg-yellow-500' },
  blocked: { label: 'Blocked', color: 'bg-red-500' },
  done: { label: 'Done', color: 'bg-emerald-500' },
};

export function getValidTransitions(currentStatus: TaskStatus): TaskStatus[] {
  return ALL_STATUSES.filter(s => s !== currentStatus);
}

export function validateTransition(currentStatus: string, newStatus: string): boolean {
  return ALL_STATUSES.includes(newStatus as TaskStatus) && currentStatus !== newStatus;
}
