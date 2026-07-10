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
 * superadmin. getCase's visibility clause admits the requester when they are
 * the assignee (scope OR identity), so a cross-agency assignee — e.g. a
 * Ministry or MARAD officer a superadmin assigned to a GWI case — reaches
 * this helper and the identity clause grants them the write. Out-of-scope
 * NON-assignees still 404 before this helper runs (locked Q-spec).
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

/**
 * Who may be assigned. A SUPERADMIN assigner may pick ANY active human user
 * (any agency, any role — only role='system' service accounts are excluded);
 * an agency_manager assigner keeps the locked Q3 rule: the case agency's
 * active users + superadmins.
 */
export function isValidAssignmentTarget(
  target: { role: string | null; agency: string | null; is_active: boolean },
  effectiveAgency: string | null | undefined,
  assignerRole?: string | null,
): boolean {
  if (!target.is_active) return false;
  if (target.role === 'system') return false;
  if (assignerRole === 'superadmin') return true;
  if (target.role === 'superadmin') return true;
  if (target.role !== 'agency_manager') return false;
  if (!target.agency || !effectiveAgency) return false;
  return target.agency.toUpperCase() === effectiveAgency.toUpperCase();
}
