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

export function canAccessAgency(
  userRole: Role,
  userAgency: string | null,
  targetAgency: string
): boolean {
  if (MINISTRY_ROLES.includes(userRole)) return true;
  return userAgency?.toLowerCase() === targetAgency.toLowerCase();
}

export function canUploadData(
  userRole: Role,
  userAgency: string | null,
  targetAgency: string
): boolean {
  if (userRole === 'dg') return true;
  if (userRole === 'minister' || userRole === 'ps' || userRole === 'parl_sec') return false;
  if (userRole === 'agency_admin' || userRole === 'officer') {
    return userAgency?.toLowerCase() === targetAgency.toLowerCase();
  }
  return false;
}

export function canAssignTasks(userRole: Role): boolean {
  return ['dg', 'minister', 'ps', 'parl_sec', 'agency_admin'].includes(userRole);
}

export function canAccessPsipSync(userRole: Role, userAgency: string | null | undefined): boolean {
  if (MINISTRY_ROLES.includes(userRole)) return true;
  return userRole === 'agency_admin' && userAgency?.toUpperCase() === 'GWI';
}

export async function requirePsipSyncAccess() {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin']);
  if (result instanceof NextResponse) return { error: result };
  const { session } = result;
  if (!canAccessPsipSync(session.user.role, session.user.agency)) {
    return { error: NextResponse.json({ error: 'PSIP sync is scoped to GWI' }, { status: 403 }) };
  }
  return { session };
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
