import type { TaskStatus } from '@/lib/task-types';

// ── Status colors ─────────────────────────────────────────────────────────
// Single source of truth for task status visual styling across all components.

export const STATUS_DOT: Record<TaskStatus, string> = {
  new: 'bg-blue-400',
  active: 'bg-gold-500',
  blocked: 'bg-red-400',
  done: 'bg-emerald-400',
};

export const STATUS_PILL: Record<string, string> = {
  new: 'bg-blue-500/20 text-blue-400',
  active: 'bg-gold-500/20 text-gold-500',
  blocked: 'bg-red-500/20 text-red-400',
  done: 'bg-emerald-500/20 text-emerald-400',
};

export const STATUS_OPTIONS: { value: TaskStatus; label: string; dot: string }[] = [
  { value: 'new', label: 'New', dot: STATUS_DOT.new },
  { value: 'active', label: 'Active', dot: STATUS_DOT.active },
  { value: 'blocked', label: 'Blocked', dot: STATUS_DOT.blocked },
  { value: 'done', label: 'Done', dot: STATUS_DOT.done },
];

export const STATUS_LABEL: Record<string, string> = {
  new: 'New',
  active: 'Active',
  blocked: 'Blocked',
  done: 'Done',
};

// ── Priority colors ───────────────────────────────────────────────────────

export const PRIORITY_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-400',
  medium: 'bg-gold-500',
  low: 'bg-white/40',
};

// ── Notification priority (hex for inline styles) ─────────────────────────

export function notificationPriorityColor(priority: string): string {
  switch (priority) {
    case 'urgent': return '#dc2626';
    case 'high': return '#fb923c';
    case 'medium': return '#d4af37';
    default: return 'transparent';
  }
}
