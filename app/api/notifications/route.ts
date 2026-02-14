import { NextRequest, NextResponse } from 'next/server';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllRead,
  dismissNotification,
  dismissAll,
  markDelivered,
} from '@/lib/notifications';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const userId = searchParams.get('user_id') || 'dg';
    const unreadOnly = searchParams.get('unread_only') === 'true';
    const category = searchParams.get('category') || undefined;
    const actionRequiredOnly = searchParams.get('action_required') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const [notifications, unread_count] = await Promise.all([
      getNotifications(userId, { unreadOnly, category, actionRequiredOnly, limit, offset }),
      getUnreadCount(userId),
    ]);

    return NextResponse.json({ notifications, unread_count });
  } catch (err) {
    console.error('GET /api/notifications error:', err);
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, id, user_id } = body;

    switch (action) {
      case 'mark_read':
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await markAsRead(id);
        break;
      case 'mark_all_read':
        await markAllRead(user_id || 'dg');
        break;
      case 'dismiss':
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await dismissNotification(id);
        break;
      case 'dismiss_all':
        await dismissAll(user_id || 'dg');
        break;
      case 'delivered':
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await markDelivered(id);
        break;
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PATCH /api/notifications error:', err);
    return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 });
  }
}
