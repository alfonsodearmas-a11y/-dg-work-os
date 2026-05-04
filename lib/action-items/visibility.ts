import type { TaskWithExtensions, UserStaffFields } from './types';

const MINISTRY_ROLES = new Set(['dg', 'minister', 'ps', 'parl_sec']);

export function canSeeTask(user: UserStaffFields, task: TaskWithExtensions): boolean {
  if (!user.is_active) return false;

  if (task.visibility_scope === 'dg_only') {
    return user.role === 'dg';
  }

  // agency_normal:
  if (MINISTRY_ROLES.has(user.role)) return true;

  if (user.id === task.owner_user_id) return true;
  if (task.delegated_to_id && user.id === task.delegated_to_id) return true;

  if (user.agency && task.agency &&
      user.agency.toLowerCase() === task.agency.toLowerCase()) {
    return true;
  }

  return false;
}
