import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { createNotification } from '@/lib/notifications/notification-service';
import { NotificationDeliveryError } from '@/lib/notifications/errors';
import { MINISTRY_ROLES } from '@/lib/people-types';
import { parseBody, apiError, withErrorHandler } from '@/lib/api-utils';
import { logger } from '@/lib/logger';
import { TASK_COLUMNS, flattenTaskOwner } from '@/lib/task-types';

const patchTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(['new', 'active', 'blocked', 'done', 'awaiting_verification', 'superseded']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).nullable().optional(),
  due_date: z.string().nullable().optional(),
  agency: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  blocked_reason: z.string().nullable().optional(),
  owner_user_id: z.string().uuid().optional(),
});

export const PATCH = withErrorHandler(async (
  request: NextRequest,
  ctx?: unknown,
) => {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
  const { data, error: validationError } = await parseBody(request, patchTaskSchema);
  if (validationError) return validationError;

  const { data: task } = await supabaseAdmin
    .from('tasks')
    .select('owner_user_id, assigned_by_user_id, status, title, due_date')
    .eq('id', id)
    .single();

  if (!task) {
    return apiError('NOT_FOUND', 'Task not found', 404);
  }

  if (data.status !== undefined) {
    const tryingToEnterLifecycle = data.status === 'awaiting_verification';
    const tryingToLeaveLifecycle = task.status === 'awaiting_verification' && data.status !== 'awaiting_verification';
    if (tryingToEnterLifecycle || tryingToLeaveLifecycle) {
      return apiError(
        'INVALID_TRANSITION',
        'Use /api/tasks/[id]/{complete,verify,dispute} for verification-flow transitions.',
        409,
      );
    }
  }

  const isOwner = task.owner_user_id === session.user.id;
  const isAssigner = task.assigned_by_user_id === session.user.id;
  const isMinistryRole = MINISTRY_ROLES.includes(session.user.role);

  if (!isOwner && !isAssigner && !isMinistryRole) {
    return apiError('FORBIDDEN', 'Not authorized to update this task', 403);
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (data.title !== undefined) updates.title = data.title;
  if (data.description !== undefined) updates.description = data.description;
  if (data.status !== undefined) updates.status = data.status;
  if (data.priority !== undefined) updates.priority = data.priority;
  if (data.due_date !== undefined) updates.due_date = data.due_date;
  if (data.agency !== undefined) updates.agency = data.agency;
  if (data.role !== undefined) updates.role = data.role;
  if (data.blocked_reason !== undefined) updates.blocked_reason = data.blocked_reason;
  if (data.owner_user_id !== undefined) {
    updates.owner_user_id = data.owner_user_id;
    updates.assigned_by_user_id = session.user.id;
  }

  if (data.status === 'done' && task.status !== 'done') {
    updates.completed_at = new Date().toISOString();
  }
  if (data.status && data.status !== 'done') {
    updates.completed_at = null;
  }

  if (data.status && data.status !== 'blocked' && task.status === 'blocked') {
    updates.blocked_reason = null;
  }

  const { data: updated, error } = await supabaseAdmin
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .select(`${TASK_COLUMNS}, owner:users!owner_user_id(id, name)`)
    .single();

  if (error) {
    return apiError('DB_ERROR', error.message, 500);
  }

  const flatTask = flattenTaskOwner(updated);

  const activityEntries: Array<{ task_id: string; user_id: string; action: string; old_value: string | null; new_value: string | null }> = [];

  if (data.status !== undefined && data.status !== task.status) {
    activityEntries.push({
      task_id: id,
      user_id: session.user.id,
      action: `moved_to_${data.status}`,
      old_value: task.status,
      new_value: data.status,
    });
  }
  if (data.due_date !== undefined) {
    activityEntries.push({
      task_id: id,
      user_id: session.user.id,
      action: 'due_date_changed',
      old_value: null,
      new_value: data.due_date || 'cleared',
    });
  }
  if (data.owner_user_id !== undefined && data.owner_user_id !== task.owner_user_id) {
    activityEntries.push({
      task_id: id,
      user_id: session.user.id,
      action: 'assignee_changed',
      old_value: task.owner_user_id,
      new_value: flatTask.owner_name || data.owner_user_id,
    });
  }

  if (activityEntries.length > 0) {
    await supabaseAdmin.from('task_activity').insert(activityEntries);
  }

  // --- Notifications (fire-and-forget) ---
  Promise.resolve((async () => {
    try {
      const statusChanged = data.status !== undefined && data.status !== task.status;
      const isOverdue = updated.due_date ? new Date(updated.due_date) < new Date() : false;

      // Task assignment notification
      if (data.owner_user_id !== undefined && data.owner_user_id !== task.owner_user_id) {
        createNotification({
          recipientId: data.owner_user_id,
          actorId: session.user.id,
          eventType: 'task_assigned',
          entityType: 'task',
          entityId: id,
          title: `You were assigned: ${updated.title}`,
          body: updated.description?.substring(0, 120) || '',
          referenceUrl: '/tasks',
          metadata: { taskId: id },
          tierContext: {
            taskPriority: updated.priority,
            taskStatus: updated.status,
            isOverdue,
          },
        }).catch((err: unknown) => {
          if (err instanceof NotificationDeliveryError) {
            logger.error(err.toLogContext(), '[task-patch] notification delivery failed');
          } else {
            logger.error({ err }, '[task-patch] notification delivery failed (unexpected error type)');
          }
        });
      }

      // Task blocked notification — notify all DG users + task owner (dedup if owner is a DG)
      if (data.status === 'blocked' && task.status !== 'blocked') {
        const { data: dgUsers } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('role', 'dg')
          .eq('is_active', true);

        const notifiedIds = new Set<string>();
        for (const dg of dgUsers || []) {
          notifiedIds.add(dg.id);
          createNotification({
            recipientId: dg.id,
            actorId: session.user.id,
            eventType: 'task_blocked',
            entityType: 'task',
            entityId: id,
            title: `Task blocked: ${updated.title}`,
            body: data.blocked_reason || 'No reason provided',
            referenceUrl: '/tasks',
            metadata: { taskId: id },
            tierContext: { taskStatus: 'blocked' },
          }).catch((err: unknown) => {
            if (err instanceof NotificationDeliveryError) {
              logger.error(err.toLogContext(), '[task-patch] notification delivery failed');
            } else {
              logger.error({ err }, '[task-patch] notification delivery failed (unexpected error type)');
            }
          });
        }

        // Also notify the task owner if not already notified as a DG user
        if (task.owner_user_id && !notifiedIds.has(task.owner_user_id)) {
          createNotification({
            recipientId: task.owner_user_id,
            actorId: session.user.id,
            eventType: 'task_blocked',
            entityType: 'task',
            entityId: id,
            title: `Task blocked: ${updated.title}`,
            body: data.blocked_reason || 'No reason provided',
            referenceUrl: '/tasks',
            metadata: { taskId: id },
            tierContext: { taskStatus: 'blocked' },
          }).catch((err: unknown) => {
            if (err instanceof NotificationDeliveryError) {
              logger.error(err.toLogContext(), '[task-patch] notification delivery failed');
            } else {
              logger.error({ err }, '[task-patch] notification delivery failed (unexpected error type)');
            }
          });
        }
      }

      // Task status change notification (non-blocked, non-done) — notify task owner
      if (statusChanged && data.status !== 'blocked' && data.status !== 'done' && task.owner_user_id) {
        createNotification({
          recipientId: task.owner_user_id,
          actorId: session.user.id,
          eventType: 'task_status_change',
          entityType: 'task',
          entityId: id,
          title: `Task moved to ${data.status}: ${updated.title}`,
          body: '',
          referenceUrl: '/tasks',
          metadata: { taskId: id },
          tierContext: { taskStatus: data.status },
        }).catch((err: unknown) => {
          if (err instanceof NotificationDeliveryError) {
            logger.error(err.toLogContext(), '[task-patch] notification delivery failed');
          } else {
            logger.error({ err }, '[task-patch] notification delivery failed (unexpected error type)');
          }
        });
      }

      // Task completed notification — notify the assigner
      if (data.status === 'done' && task.status !== 'done' && task.assigned_by_user_id) {
        createNotification({
          recipientId: task.assigned_by_user_id,
          actorId: session.user.id,
          eventType: 'task_completed',
          entityType: 'task',
          entityId: id,
          title: `Task completed: ${updated.title}`,
          body: '',
          referenceUrl: '/tasks',
          metadata: { taskId: id },
          tierContext: { taskStatus: 'done' },
        }).catch((err: unknown) => {
          if (err instanceof NotificationDeliveryError) {
            logger.error(err.toLogContext(), '[task-patch] notification delivery failed');
          } else {
            logger.error({ err }, '[task-patch] notification delivery failed (unexpected error type)');
          }
        });
      }
    } catch (err) {
      logger.error({ err }, '[task-patch] Notification block failed');
    }
  })()).catch((err: unknown) => logger.error({ err }, '[task-patch] Notification block uncaught'));

  return NextResponse.json({ task: flatTask });
});

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const { id } = await params;

  // Fetch task
  const { data: task } = await supabaseAdmin
    .from('tasks')
    .select('owner_user_id, status')
    .eq('id', id)
    .single();

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  // Only DG can delete anything; owner can delete if new
  const isDG = session.user.role === 'dg';
  const isOwnerNew = task.owner_user_id === session.user.id && task.status === 'new';

  if (!isDG && !isOwnerNew) {
    return NextResponse.json({ error: 'Not authorized to delete this task' }, { status: 403 });
  }

  const { error } = await supabaseAdmin
    .from('tasks')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
