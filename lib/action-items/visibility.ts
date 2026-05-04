import type { ActionItemRow, UserStaffFields } from './types';

const MINISTRY_ROLES = new Set(['dg', 'minister', 'ps', 'parl_sec']);

export function canSeeItem(user: UserStaffFields, item: ActionItemRow): boolean {
  if (!user.is_active) return false;

  if (item.visibility_scope === 'dg_only') {
    return user.role === 'dg';
  }

  // agency_normal:
  if (MINISTRY_ROLES.has(user.role)) return true;

  if (user.id === item.owner_id) return true;
  if (user.id === item.delegated_to_id) return true;

  if (user.agency && user.agency.toLowerCase() === item.agency_name.toLowerCase()) {
    return true;
  }

  return false;
}
