import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getUserModulePermissions } from '@/lib/modules/access';

export async function GET() {
  const session = await auth(); // TODO: migrate to requireRole()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const permissionsMap = await getUserModulePermissions(session.user.id, session.user.role);

  // Derive modules list from permissions (every key in the map has canView=true)
  const modules = Object.keys(permissionsMap);
  const permissions: Record<string, { canView: boolean; canEdit: boolean }> = {};
  for (const [slug, perm] of Object.entries(permissionsMap)) {
    permissions[slug] = { canView: perm.canView, canEdit: perm.canEdit };
  }

  return NextResponse.json({ modules, permissions });
}
