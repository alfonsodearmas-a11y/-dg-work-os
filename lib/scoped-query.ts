import type { Session } from 'next-auth';

const MINISTRY_ROLES = ['dg', 'minister', 'ps'];

/**
 * Returns the agency scope for the current user session.
 * Ministry roles (dg, minister, ps) → null (full access, no filter).
 * Agency roles → their agency string.
 */
export function getAgencyScope(session: Session): string | null {
  const user = session.user as { role: string; agency: string | null };
  if (MINISTRY_ROLES.includes(user.role)) return null;
  return user.agency;
}

/**
 * Returns true if the user has ministry-level access (sees all agencies).
 */
export function isMinistryRole(session: Session): boolean {
  return MINISTRY_ROLES.includes((session.user as { role: string }).role);
}
