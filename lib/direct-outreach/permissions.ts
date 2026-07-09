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
