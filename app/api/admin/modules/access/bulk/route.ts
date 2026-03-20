import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import {
  bulkUpsertModulePermissions,
  getUserModuleOverridesDetailed,
} from '@/lib/modules/access';

// POST /api/admin/modules/access/bulk — bulk upsert module permissions (DG only)
// Body: { userId: string, permissions: Array<{ moduleSlug, accessType, canEdit, agency? }> }
export async function POST(req: NextRequest) {
  const result = await requireRole(['dg']);
  if (result instanceof NextResponse) return result;

  const body = await req.json();
  const { userId, permissions } = body as {
    userId?: string;
    permissions?: Array<{
      moduleSlug: string;
      accessType: 'grant' | 'deny';
      canEdit: boolean;
      agency?: string | null;
    }>;
  };

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  if (!permissions || !Array.isArray(permissions) || permissions.length === 0) {
    return NextResponse.json({ error: 'permissions array is required and must not be empty' }, { status: 400 });
  }

  // Validate each permission entry
  for (const p of permissions) {
    if (!p.moduleSlug || !p.accessType) {
      return NextResponse.json(
        { error: 'Each permission must have moduleSlug and accessType' },
        { status: 400 },
      );
    }
    if (p.accessType !== 'grant' && p.accessType !== 'deny') {
      return NextResponse.json(
        { error: 'accessType must be "grant" or "deny"' },
        { status: 400 },
      );
    }
  }

  const ok = await bulkUpsertModulePermissions(userId, permissions, result.session.user.id);
  if (!ok) {
    return NextResponse.json({ error: 'Failed to bulk upsert permissions' }, { status: 500 });
  }

  const overridesDetailed = await getUserModuleOverridesDetailed(userId);
  return NextResponse.json({ success: true, overridesDetailed });
}
