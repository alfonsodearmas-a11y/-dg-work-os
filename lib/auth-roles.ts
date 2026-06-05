// Client-SAFE pure role/permission helpers. NO server imports — no auth(), no db,
// no `server-only` — so client components (e.g. KanbanBoard) can import these
// without dragging the server-only Supabase auth path into the client bundle.
// `lib/auth-helpers.ts` re-exports everything here for the ~49 server call-sites.
//
// The only import is `MINISTRY_ROLES` (a pure const) and a type-only `Role`
// (erased at compile), so this module stays free of runtime server dependencies.
import { MINISTRY_ROLES } from './people-types';
import type { Role } from './auth';

export type { Role };

// Canonical agency form is UPPERCASE per migration 106 (2026-05-05): the
// users.agency column CHECK enforces it. Helpers match against the canonical
// form; the target is uppercased once at the boundary so legacy call-sites
// passing 'gpl' keep working without a coordinated rename.
export function canAccessAgency(
  userRole: Role,
  userAgency: string | null,
  targetAgency: string
): boolean {
  if (MINISTRY_ROLES.includes(userRole)) return true;
  return userAgency === targetAgency.toUpperCase();
}

export function canUploadData(
  userRole: Role,
  userAgency: string | null,
  targetAgency: string
): boolean {
  if (userRole === 'dg') return true;
  if (userRole === 'minister' || userRole === 'ps' || userRole === 'parl_sec') return false;
  if (userRole === 'agency_admin' || userRole === 'officer') {
    return userAgency === targetAgency.toUpperCase();
  }
  return false;
}

export function canAssignTasks(userRole: Role): boolean {
  return ['dg', 'minister', 'ps', 'parl_sec', 'agency_admin'].includes(userRole);
}

/**
 * Whether the user can verify a completed task (drives the role-aware Pending
 * Verification column). Ministry roles can verify any task; an agency_admin can
 * verify only tasks scoped to their portfolio agency. `taskAgency` optional:
 * omitted = "could this user ever verify *some* task?" (used to decide whether to
 * render the column at all).
 */
export function canVerify(
  userRole: Role,
  userAgency: string | null,
  taskAgency?: string | null
): boolean {
  if (['dg', 'minister', 'ps', 'parl_sec'].includes(userRole)) return true;
  if (userRole === 'agency_admin' && userAgency) {
    if (!taskAgency) return true;
    return userAgency === taskAgency.toUpperCase();
  }
  return false;
}

// PSIP upload is ministry-only (dg/minister/ps).
export function canAccessPsipSync(userRole: Role, _userAgency: string | null | undefined): boolean {
  void _userAgency;
  return MINISTRY_ROLES.includes(userRole);
}
