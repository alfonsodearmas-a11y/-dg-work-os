import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import {
  grantModuleAccess,
  revokeModuleAccess,
  getUserModuleGrants,
} from '@/lib/modules/access';

// GET /api/admin/modules/access?userId=xxx — get a user's explicit module grants
export async function GET(req: NextRequest) {
  const result = await requireRole(['dg', 'minister', 'ps']);
  if (result instanceof NextResponse) return result;

  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const grants = await getUserModuleGrants(userId);
  return NextResponse.json({ grants });
}

// POST /api/admin/modules/access — grant module access (DG only)
export async function POST(req: NextRequest) {
  const result = await requireRole(['dg']);
  if (result instanceof NextResponse) return result;

  const { userId, moduleSlug } = await req.json();
  if (!userId || !moduleSlug) {
    return NextResponse.json({ error: 'userId and moduleSlug are required' }, { status: 400 });
  }

  const ok = await grantModuleAccess(userId, moduleSlug, result.session.user.id);
  if (!ok) {
    return NextResponse.json({ error: 'Failed to grant access' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/admin/modules/access — revoke module access (DG only)
export async function DELETE(req: NextRequest) {
  const result = await requireRole(['dg']);
  if (result instanceof NextResponse) return result;

  const { userId, moduleSlug } = await req.json();
  if (!userId || !moduleSlug) {
    return NextResponse.json({ error: 'userId and moduleSlug are required' }, { status: 400 });
  }

  const ok = await revokeModuleAccess(userId, moduleSlug, result.session.user.id);
  if (!ok) {
    return NextResponse.json({ error: 'Failed to revoke access' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
