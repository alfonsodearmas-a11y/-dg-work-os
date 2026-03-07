import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { getRolesWithPermissions, getAllPermissions, getPermissionsForRole } from '@/lib/people-permissions';

export async function GET() {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  const [roles, permissions, myPermissions] = await Promise.all([
    getRolesWithPermissions(),
    getAllPermissions(),
    getPermissionsForRole(session.user.role),
  ]);

  return NextResponse.json({
    roles,
    permissions,
    myPermissions,
    myRole: session.user.role,
  });
}
