// Client-SAFE pure role/permission helpers. NO server imports — no auth(), no db,
// no `server-only` — so client components (e.g. KanbanBoard) can import these
// without dragging the server-only Supabase auth path into the client bundle.
//
// PHASE 2 (role simplification): two permission levels.
//   superadmin      — sees and does everything, all agencies (D3: includes
//                     upload/NPTAB breadth the old minister/ps roles lacked).
//   agency_manager  — sees and does everything for THEIR OWN agency (D2:
//                     absorbs the old officer role — full agency powers).
// Title (formal_title) is display-only and never consulted here.
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
  if (userRole === 'superadmin') return true;
  return userAgency === targetAgency.toUpperCase();
}

export function canUploadData(
  userRole: Role,
  userAgency: string | null,
  targetAgency: string
): boolean {
  if (userRole === 'superadmin') return true;
  return userAgency === targetAgency.toUpperCase();
}

export function canAssignTasks(_userRole: Role): boolean {
  // Both levels can assign (D2: ex-officers gain this).
  void _userRole;
  return true;
}

/**
 * Whether the user can verify a completed task (drives the role-aware Pending
 * Verification column). Superadmins can verify any task; an agency_manager can
 * verify only tasks scoped to their own agency. `taskAgency` optional:
 * omitted = "could this user ever verify *some* task?" (used to decide whether to
 * render the column at all).
 */
export function canVerify(
  userRole: Role,
  userAgency: string | null,
  taskAgency?: string | null
): boolean {
  if (userRole === 'superadmin') return true;
  if (userAgency) {
    if (!taskAgency) return true;
    return userAgency === taskAgency.toUpperCase();
  }
  return false;
}

// PSIP upload stays superadmin-only.
export function canAccessPsipSync(userRole: Role, _userAgency: string | null | undefined): boolean {
  void _userAgency;
  return userRole === 'superadmin';
}
