// Direct Outreach — pure permission helpers (unit-testable, shared by the API
// routes and the panel UI). Mirrors lib/tasks/permissions.ts in spirit.
//
// Ownership follows the EFFECTIVE agency (COALESCE(transfer override, workbook
// agency)) — a case transferred GWI→GPL is GPL's to assign, not GWI's.

/** Who may set/clear a case's responsible officer (locked decision Q2). */
export function canAssignOutreachCase(
  role: string | null | undefined,
  userAgency: string | null | undefined,
  effectiveAgency: string | null | undefined,
): boolean {
  if (role === 'superadmin') return true;
  if (role !== 'agency_manager') return false;
  if (!userAgency || !effectiveAgency) return false;
  return userAgency.toUpperCase() === effectiveAgency.toUpperCase();
}

/**
 * Who may post progress updates / set working status / set the officer target
 * date (v3): the ASSIGNED officer, the owning agency's manager, or a
 * superadmin. NOTE: the route's agency-scoped getCase runs FIRST, so an
 * agency_manager outside the case's effective agency gets an opaque 404
 * before this helper is consulted — including an assignee stranded by a
 * workbook agency change (locked decision: no cross-agency access; the owning
 * manager reassigns). The identity clause is defense-in-depth for callers
 * that can already see the case, not a scope override.
 */
export function canPostOutreachUpdate(
  role: string | null | undefined,
  userId: string | null | undefined,
  userAgency: string | null | undefined,
  effectiveAgency: string | null | undefined,
  assigneeUserId: string | null | undefined,
): boolean {
  if (assigneeUserId && userId && userId === assigneeUserId) return true;
  return canAssignOutreachCase(role, userAgency, effectiveAgency);
}

/** Who may be assigned (locked decision Q3): the case agency's active users + superadmins. */
export function isValidAssignmentTarget(
  target: { role: string | null; agency: string | null; is_active: boolean },
  effectiveAgency: string | null | undefined,
): boolean {
  if (!target.is_active) return false;
  if (target.role === 'superadmin') return true;
  if (target.role !== 'agency_manager') return false;
  if (!target.agency || !effectiveAgency) return false;
  return target.agency.toUpperCase() === effectiveAgency.toUpperCase();
}
