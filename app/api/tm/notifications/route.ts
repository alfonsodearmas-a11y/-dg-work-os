import { NextRequest, NextResponse } from 'next/server';
import { authenticateAny, AuthError } from '@/lib/auth';
import { getTaskNotifications, getUnreadCount } from '@/lib/task-notifications';

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateAny(request);
    const url = request.nextUrl;

    const unreadOnly = url.searchParams.get('unreadOnly') === 'true';
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const [result, unreadCount] = await Promise.all([
      getTaskNotifications(user.id, { unreadOnly, limit, offset }),
      getUnreadCount(user.id),
    ]);

    return NextResponse.json({ success: true, data: { ...result, unreadCount } });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
