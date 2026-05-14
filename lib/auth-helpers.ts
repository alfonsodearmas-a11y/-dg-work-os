import { NextResponse } from 'next/server';
import { auth, type Role } from './auth';
import { MINISTRY_ROLES } from './people-types';

export type { Role };

export async function requireRole(allowedRoles: Role[]) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Parliamentary Secretary has the same access privileges as Permanent Secretary
  const effectiveRoles = allowedRoles.includes('ps') && !allowedRoles.includes('parl_sec')
    ? [...allowedRoles, 'parl_sec' as Role]
    : allowedRoles;

  if (!effectiveRoles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  return { session };
}

// Canonical agency form is UPPERCASE per migration 106 (2026-05-05): the
// users.agency column CHECK constraint enforces it. Helper does exact
// match against the canonical form; the target is uppercased once at the
// boundary so the ~70 legacy call-sites passing 'gpl' continue to work
// without a coordinated rename.
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
 * Whether the user can verify a completed task (D7 — drives the role-aware
 * Pending Verification column). Ministry roles can verify any task; an
 * agency_admin can verify only tasks scoped to their portfolio agency.
 *
 * `taskAgency` is optional: when omitted, the helper answers the broad
 * question "could this user ever verify *some* task?", which is what the
 * board uses to decide whether to render a Pending Verification column.
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

// PSIP upload is ministry-only (dg/minister/ps). Deprecated GWI-specific
// helper retained as a thin alias for any callers that haven't moved yet.
export function canAccessPsipSync(userRole: Role, _userAgency: string | null | undefined): boolean {
  void _userAgency;
  return MINISTRY_ROLES.includes(userRole);
}

export async function requirePsipSyncAccess() {
  const result = await requireRole(['dg', 'minister', 'ps']);
  if (result instanceof NextResponse) return { error: result };
  return { session: result.session };
}

const UPLOAD_ROLES: Role[] = ['dg', 'agency_admin', 'officer'];

/**
 * Combined auth check for upload routes: verifies role + agency upload permission.
 * Returns `{ session }` on success, or a NextResponse error on failure.
 */
export async function requireUploadRole(agency: string) {
  const result = await requireRole(UPLOAD_ROLES);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  if (!canUploadData(session.user.role, session.user.agency, agency)) {
    return NextResponse.json({ error: `Cannot upload ${agency} data` }, { status: 403 });
  }

  return { session };
}
