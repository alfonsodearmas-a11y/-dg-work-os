import { NextResponse } from 'next/server';
// `auth` is the Supabase-backed accessor, re-exported by lib/auth (the stable
// auth surface). Importing it via lib/auth keeps that module the single mock
// point for tests (vi.mock('@/lib/auth')).
import { auth, type Role } from './auth';
import {
  canAccessAgency,
  canUploadData,
  canAssignTasks,
  canVerify,
  canAccessPsipSync,
} from './auth-roles';

export type { Role };

// Re-export the client-safe pure permission helpers (defined in lib/auth-roles.ts)
// so the ~49 server call-sites that import them from '@/lib/auth-helpers' keep
// working unchanged. Client components must import these from '@/lib/auth-roles'
// directly — this module pulls in the server-only Supabase auth().
export { canAccessAgency, canUploadData, canAssignTasks, canVerify, canAccessPsipSync };

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
