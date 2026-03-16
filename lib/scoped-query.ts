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

/**
 * View As–aware agency scope.
 * If the real session is DG and a viewAsAgency is provided, returns that agency.
 * If the real session is DG and a viewAsRole is provided (non-ministry + no agency), returns null.
 * Otherwise falls back to the standard getAgencyScope.
 */
export function getViewAsAgencyScope(
  session: Session,
  viewAsRole?: string | null,
  viewAsAgency?: string | null,
): string | null {
  const realRole = (session.user as { role: string }).role;

  // Only DG can use View As overrides
  if (realRole === 'dg' && (viewAsRole || viewAsAgency)) {
    const effectiveRole = viewAsRole || realRole;
    if (MINISTRY_ROLES.includes(effectiveRole)) return null;
    return viewAsAgency || null;
  }

  return getAgencyScope(session);
}

/**
 * View As–aware role check.
 * Returns the effective role if DG is using View As, otherwise the real role.
 */
export function getEffectiveRole(
  session: Session,
  viewAsRole?: string | null,
): string {
  const realRole = (session.user as { role: string }).role;
  if (realRole === 'dg' && viewAsRole) return viewAsRole;
  return realRole;
}
