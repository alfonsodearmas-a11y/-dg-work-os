import { NextResponse } from 'next/server';
import { sendTestPush } from '@/lib/push';
import { requireRole } from '@/lib/auth-helpers';

export async function POST() {
  const authResult = await requireRole(['dg', 'minister', 'ps']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  try {
    const result = await sendTestPush(session.user.id);
    return NextResponse.json(result);
  } catch (err) {
    console.error('POST /api/push/test error:', err);
    return NextResponse.json({ error: 'Failed to send test push' }, { status: 500 });
  }
}
