/**
 * Mirrors the users_agency_manager_agency_check DB constraint at the API layer,
 * for every PATCH shape (agency-only changes included — the constraint must
 * never be the first thing to reject a request with a 500).
 */
export function agencyPatchError(
  existing: { role: string; agency: string | null },
  patch: { role?: string; agency?: string | null; name?: string },
): string | null {
  const effectiveRole = patch.role ?? existing.role;
  const effectiveAgency = patch.agency !== undefined ? patch.agency : existing.agency;
  if (effectiveRole === 'agency_manager' && !effectiveAgency) {
    return 'Agency is required for the agency manager role';
  }
  return null;
}
