// Shared task status transition logic — safe for client AND server import
// No 'use client' directive: this is a pure-logic module with no React or DB deps.

export type TaskStatus = 'assigned' | 'acknowledged' | 'in_progress' | 'submitted' | 'verified' | 'rejected' | 'overdue';

const CEO_TRANSITIONS: Record<string, TaskStatus[]> = {
  assigned: ['acknowledged'],
  acknowledged: ['in_progress'],
  in_progress: ['submitted'],
  rejected: ['in_progress'],
};

const DG_TRANSITIONS: Record<string, TaskStatus[]> = {
  submitted: ['verified', 'rejected'],
  // DG can reassign (handled separately)
};

export function getValidTransitions(currentStatus: TaskStatus, role: string): TaskStatus[] {
  if (currentStatus === 'overdue' || currentStatus === 'verified') return [];

  if (role === 'director' || role === 'admin') {
    const transitions = DG_TRANSITIONS[currentStatus] || [];
    // DG can force-assign from any status
    if (currentStatus !== 'assigned') {
      return [...transitions, 'assigned'];
    }
    return transitions;
  }

  if (role === 'ceo') {
    return CEO_TRANSITIONS[currentStatus] || [];
  }

  return [];
}

export function validateTransition(currentStatus: TaskStatus, newStatus: TaskStatus, role: string): boolean {
  if (role === 'director' || role === 'admin') {
    // DG can also force-assign
    if (newStatus === 'assigned') return true;
    return DG_TRANSITIONS[currentStatus]?.includes(newStatus) ?? false;
  }
  if (role === 'ceo') {
    return CEO_TRANSITIONS[currentStatus]?.includes(newStatus) ?? false;
  }
  return false;
}
