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
import { canAccessModule } from './modules/role-modules';

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

  if (!allowedRoles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  return { session };
}

/**
 * Combined auth check for a module-scoped route. Returns `{ session }` only for a
 * superadmin or an `agency_manager` whose agency actually grants `moduleSlug`
 * (per `canAccessModule`) — keeping the server boundary in lockstep with the
 * client ModuleGate so a route can never be more permissive than the UI that
 * exposes it.
 */
export async function requireModuleAccess(moduleSlug: string) {
  const result = await requireRole(['superadmin', 'agency_manager']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  if (!canAccessModule(session.user.role, session.user.agency, moduleSlug)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  return { session };
}

/**
 * Hinterland Airstrips module gate — superadmin or the `HAS` agency_manager.
 * Closes the gap where a bare role check let any agency_manager (GPL/GWI/…)
 * reach airstrip data the UI hides.
 */
export const requireAirstripAccess = () => requireModuleAccess('airstrips');

/**
 * Hinterland Communities module gate — superadmin (phase 1). Reads the same
 * canAccessModule map as the sidebar/ModuleGate so the server can never be more
 * permissive than the UI that exposes it.
 */
export const requireHinterlandAccess = () => requireModuleAccess('hinterland-communities');

export async function requirePsipSyncAccess() {
  const result = await requireRole(['superadmin']);
  if (result instanceof NextResponse) return { error: result };
  return { session: result.session };
}

const UPLOAD_ROLES: Role[] = ['superadmin', 'agency_manager'];

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
