import { NextResponse } from 'next/server';
import { auth, type Role } from './auth';

export type { Role };

export async function requireRole(allowedRoles: Role[]) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!allowedRoles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  return { session };
}

const MINISTRY_ROLES: Role[] = ['dg', 'minister', 'ps'];

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
  if (userRole === 'minister' || userRole === 'ps') return false;
  if (userRole === 'agency_admin' || userRole === 'officer') {
    return userAgency?.toLowerCase() === targetAgency.toLowerCase();
  }
  return false;
}

export function canAssignTasks(userRole: Role): boolean {
  return ['dg', 'minister', 'ps', 'agency_admin'].includes(userRole);
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
