import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { resetUserModuleOverrides } from '@/lib/modules/access';

// POST /api/admin/modules/access/reset — reset user to role defaults (DG only)
export async function POST(req: NextRequest) {
  const result = await requireRole(['superadmin']);
  if (result instanceof NextResponse) return result;

  const { userId } = await req.json();
  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const ok = await resetUserModuleOverrides(userId, result.session.user.id);
  if (!ok) {
    return NextResponse.json({ error: 'Failed to reset module access' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
