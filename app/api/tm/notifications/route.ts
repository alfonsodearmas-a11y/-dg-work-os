import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { getTaskNotifications, getUnreadCount } from '@/lib/task-notifications';

export async function GET(request: NextRequest) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  try {
    const url = request.nextUrl;
    const unreadOnly = url.searchParams.get('unreadOnly') === 'true';
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const [result, unreadCount] = await Promise.all([
      getTaskNotifications(session.user.id, { unreadOnly, limit, offset }),
      getUnreadCount(session.user.id),
    ]);

    return NextResponse.json({ success: true, data: { ...result, unreadCount } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
