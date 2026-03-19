import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { createNotification } from '@/lib/notifications/notification-service';
import { cleanMentionBody } from '@/lib/notifications/mention-utils';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { commentId, taskId, mentionedUserIds } = await request.json();

    if (!commentId || !taskId || !Array.isArray(mentionedUserIds) || mentionedUserIds.length === 0) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const session = authResult.session;

    // Fetch task status + comment body in parallel (independent queries)
    const [{ data: taskRow }, { data: commentRow }] = await Promise.all([
      supabaseAdmin.from('tasks').select('status').eq('id', taskId).single(),
      supabaseAdmin.from('task_comments').select('body').eq('id', commentId).single(),
    ]);
    const taskStatus = taskRow?.status || undefined;

    // Build clean body text
    const { cleanBody } = await cleanMentionBody(commentRow?.body || '');

    // Create notifications for each mentioned user
    const promises = mentionedUserIds.map((userId: string) =>
      createNotification({
        recipientId: userId,
        actorId: session.user.id,
        eventType: 'comment_mention',
        entityType: 'comment',
        entityId: commentId,
        parentEntityType: 'task',
        parentEntityId: taskId,
        title: `${session.user.name || 'Someone'} mentioned you`,
        body: cleanBody,
        referenceUrl: '/tasks',
        metadata: { taskId },
        tierContext: { taskStatus },
      }).catch((err: unknown) => {
        logger.error({ err, userId }, '[mention-notify] Failed to create notification');
        return null;
      })
    );

    await Promise.all(promises);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    logger.error({ err: error }, '[mention-notify] Error');
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
