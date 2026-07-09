import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db-admin';
import { createNotification } from '@/lib/notifications/notification-service';
import { NotificationDeliveryError } from '@/lib/notifications/errors';
import { cleanMentionBody } from '@/lib/notifications/mention-utils';
import { parseBody, apiError, withErrorHandler } from '@/lib/api-utils';
import { logger } from '@/lib/logger';

const COMMENT_COLUMNS = 'id, task_id, user_id, body, parent_id, created_at';

const createCommentSchema = z.object({
  body: z.string().min(1),
  parent_id: z.string().uuid().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole(['superadmin', 'agency_manager']);
  if (result instanceof NextResponse) return result;

  const { id } = await params;

  // Use a Supabase JOIN to fetch comments with user info in a single query (no N+1)
  const { data: comments, error } = await supabaseAdmin
    .from('task_comments')
    .select(`${COMMENT_COLUMNS}, users:user_id(name, role)`)
    .eq('task_id', id)
    .order('created_at', { ascending: true });

  if (error) {
    logger.error({ err: error }, '[task-comments] GET error');
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const enriched = (comments || []).map((c) => {
    const usersRaw = c.users as unknown;
    const user = usersRaw ? (Array.isArray(usersRaw) ? usersRaw[0] : usersRaw) as { name: string; role: string } : null;
    return {
      id: c.id,
      task_id: c.task_id,
      user_id: c.user_id,
      body: c.body,
      parent_id: c.parent_id,
      created_at: c.created_at,
      user_name: user?.name ?? 'Unknown User',
      user_role: user?.role ?? 'unknown',
    };
  });

  return NextResponse.json({ success: true, data: enriched });
}

export const POST = withErrorHandler(async (
  request: NextRequest,
  ctx?: unknown,
) => {
  const result = await requireRole(['superadmin', 'agency_manager']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const { id } = await (ctx as { params: Promise<{ id: string }> }).params;

  const { data, error: validationError } = await parseBody(request, createCommentSchema);
  if (validationError) return validationError;

  logger.info({ task_id: id, user_id: session.user.id, bodyLen: data.body.length }, '[task-comments] INSERT attempt');

  const { data: comment, error } = await supabaseAdmin
    .from('task_comments')
    .insert({
      task_id: id,
      user_id: session.user.id,
      body: data.body,
      parent_id: data.parent_id || null,
    })
    .select(COMMENT_COLUMNS)
    .single();

  if (error) {
    logger.error({ err: error }, '[task-comments] INSERT error');
    return apiError('DB_ERROR', error.message, 500);
  }

  logger.info({ commentId: comment.id }, '[task-comments] INSERT OK');

  // Log activity (fire-and-forget)
  Promise.resolve(
    supabaseAdmin.from('task_activity').insert({
      task_id: id,
      user_id: session.user.id,
      action: 'commented',
      new_value: data.body.substring(0, 200),
    }).then(({ error: actErr }) => {
      if (actErr) logger.warn({ err: actErr }, '[task-comments] Activity log failed');
    })
  ).catch((err: unknown) => logger.error({ err }, 'Failed to log activity'));

  // Create notifications for @mentions and replies (fire-and-forget)
  Promise.resolve((async () => {
    try {
      // Fetch task status (for tier context) and title (for email body) in one query
      const { data: taskRow } = await supabaseAdmin
        .from('tasks')
        .select('status, title')
        .eq('id', id)
        .single();
      const taskStatus = taskRow?.status || undefined;
      const taskTitle = taskRow?.title || undefined;

      // Extract mentions and build clean body text
      const { mentionedUserIds, cleanBody } = await cleanMentionBody(data.body);

      // Notify each mentioned user
      for (const mentionedId of mentionedUserIds) {
        createNotification({
          recipientId: mentionedId,
          actorId: session.user.id,
          eventType: 'comment_mention',
          entityType: 'comment',
          entityId: comment.id,
          parentEntityType: 'task',
          parentEntityId: id,
          parentEntityTitle: taskTitle,
          title: `${session.user.name || 'Someone'} mentioned you`,
          body: cleanBody,
          metadata: { taskId: id, commentId: comment.id },
          tierContext: { taskStatus },
        }).catch((err: unknown) => {
          if (err instanceof NotificationDeliveryError) {
            logger.error(err.toLogContext(), '[task-comments] notification delivery failed');
          } else {
            logger.error({ err }, '[task-comments] notification delivery failed (unexpected error type)');
          }
        });
      }

      // If this is a reply, notify the parent comment author
      if (data.parent_id) {
        const { data: parentComment } = await supabaseAdmin
          .from('task_comments')
          .select('user_id')
          .eq('id', data.parent_id)
          .single();

        if (parentComment && parentComment.user_id !== session.user.id && !mentionedUserIds.includes(parentComment.user_id)) {
          createNotification({
            recipientId: parentComment.user_id,
            actorId: session.user.id,
            eventType: 'comment_reply',
            entityType: 'comment',
            entityId: comment.id,
            parentEntityType: 'task',
            parentEntityId: id,
            parentEntityTitle: taskTitle,
            title: `${session.user.name || 'Someone'} replied to your comment`,
            body: cleanBody,
            metadata: { taskId: id, commentId: comment.id },
            tierContext: { taskStatus },
          }).catch((err: unknown) => {
            if (err instanceof NotificationDeliveryError) {
              logger.error(err.toLogContext(), '[task-comments] notification delivery failed');
            } else {
              logger.error({ err }, '[task-comments] notification delivery failed (unexpected error type)');
            }
          });
        }
      }
    } catch (err) {
      logger.error({ err }, '[task-comments] Notification creation failed');
    }
  })()).catch((err: unknown) => logger.error({ err }, '[task-comments] Notification block failed'));

  const flatComment = {
    ...comment,
    user_name: session.user.name || 'Unknown',
    user_role: session.user.role || '',
  };

  return NextResponse.json({ success: true, data: flatComment }, { status: 201 });
});
