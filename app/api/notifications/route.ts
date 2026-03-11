import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllRead,
  dismissNotification,
  dismissAll,
  markDelivered,
} from '@/lib/notifications';
import { parseBody, withErrorHandler } from '@/lib/api-utils';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const session = await auth(); // TODO: migrate to requireRole()
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const { searchParams } = request.nextUrl;
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
    logger.error({ err }, 'Failed to fetch notifications');
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }
}

const notificationPatchSchema = z.object({
  action: z.enum(['mark_read', 'mark_all_read', 'dismiss', 'dismiss_all', 'delivered']),
  id: z.string().min(1).optional(),
}).refine(
  (d) => ['mark_all_read', 'dismiss_all'].includes(d.action) || !!d.id,
  { message: 'id is required for this action', path: ['id'] },
);

export const PATCH = withErrorHandler(async (request: NextRequest) => {
  const session = await auth(); // TODO: migrate to requireRole()
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const { data, error } = await parseBody(request, notificationPatchSchema);
  if (error) return error;

  switch (data!.action) {
    case 'mark_read':
      await markAsRead(data!.id!);
      break;
    case 'mark_all_read':
      await markAllRead(userId);
      break;
    case 'dismiss':
      await dismissNotification(data!.id!);
      break;
    case 'dismiss_all':
      await dismissAll(userId);
      break;
    case 'delivered':
      await markDelivered(data!.id!);
      break;
  }

  return NextResponse.json({ success: true });
});
