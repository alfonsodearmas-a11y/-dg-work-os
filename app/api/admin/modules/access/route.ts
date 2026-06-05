import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import {
  grantModuleAccess,
  revokeModuleAccess,
  getUserModuleOverridesDetailed,
} from '@/lib/modules/access';

/** Derive backward-compatible overrides from detailed overrides */
function deriveOverrides(overridesDetailed: Array<{ slug: string; access_type: string }>) {
  return overridesDetailed.map(o => ({ slug: o.slug, access_type: o.access_type }));
}

// GET /api/admin/modules/access?userId=xxx — get a user's module overrides
export async function GET(req: NextRequest) {
  const result = await requireRole(['superadmin']);
  if (result instanceof NextResponse) return result;

  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const overridesDetailed = await getUserModuleOverridesDetailed(userId);
  const overrides = deriveOverrides(overridesDetailed);
  const grants = overrides.filter(o => o.access_type === 'grant').map(o => o.slug);

  return NextResponse.json({ grants, overrides, overridesDetailed });
}

// POST /api/admin/modules/access — grant module access (DG only)
export async function POST(req: NextRequest) {
  const result = await requireRole(['superadmin']);
  if (result instanceof NextResponse) return result;

  const { userId, moduleSlug, canEdit, agency } = await req.json();
  if (!userId || !moduleSlug) {
    return NextResponse.json({ error: 'userId and moduleSlug are required' }, { status: 400 });
  }

  const ok = await grantModuleAccess(
    userId,
    moduleSlug,
    result.session.user.id,
    canEdit ?? false,
    agency ?? null,
  );
  if (!ok) {
    return NextResponse.json(
      { error: `Failed to grant access to module "${moduleSlug}" — check server logs for details` },
      { status: 500 },
    );
  }

  const overridesDetailed = await getUserModuleOverridesDetailed(userId);
  const overrides = deriveOverrides(overridesDetailed);
  return NextResponse.json({ success: true, overrides, overridesDetailed });
}

// DELETE /api/admin/modules/access — revoke module access (DG only)
export async function DELETE(req: NextRequest) {
  const result = await requireRole(['superadmin']);
  if (result instanceof NextResponse) return result;

  const { userId, moduleSlug } = await req.json();
  if (!userId || !moduleSlug) {
    return NextResponse.json({ error: 'userId and moduleSlug are required' }, { status: 400 });
  }

  const ok = await revokeModuleAccess(userId, moduleSlug, result.session.user.id);
  if (!ok) {
    return NextResponse.json(
      { error: `Failed to revoke access to module "${moduleSlug}" — check server logs for details` },
      { status: 500 },
    );
  }

  const overridesDetailed = await getUserModuleOverridesDetailed(userId);
  const overrides = deriveOverrides(overridesDetailed);
  return NextResponse.json({ success: true, overrides, overridesDetailed });
}
