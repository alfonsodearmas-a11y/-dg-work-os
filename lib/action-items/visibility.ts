import type { TaskWithExtensions, UserStaffFields } from './types';
import { normalizeRole } from '@/lib/auth-session';

// user.role here is a RAW users.role value (legacy names until Phase 3) —
// normalize before any permission decision. Two-level model: superadmins see
// everything; agency managers see their own agency's / their own tasks.
export function canSeeTask(user: UserStaffFields, task: TaskWithExtensions): boolean {
  if (!user.is_active) return false;

  const role = normalizeRole(user.role);

  if (task.visibility_scope === 'dg_only') {
    return role === 'superadmin';
  }

  // agency_normal:
  if (role === 'superadmin') return true;

  if (user.id === task.owner_user_id) return true;
  if (task.delegated_to_id && user.id === task.delegated_to_id) return true;

  if (user.agency && task.agency &&
      user.agency.toLowerCase() === task.agency.toLowerCase()) {
    return true;
  }

  return false;
}
