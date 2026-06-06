// NOTE: This route uses sequential supabaseAdmin writes instead of pg transaction()
// because lib/db-pg.ts has a TLS config issue in production (self-signed cert in chain).
// Atomicity tradeoff: a failure between step 1 (task) and step 2 (comment) can leave
// an orphan task. Worst case is visible in UI as a referred task with no opening
// comment. See the rollback logic in step 2 below.
// TODO: revert to transaction() once lib/db-pg.ts TLS issue is resolved.

import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';
import { supabaseAdmin } from '@/lib/db';
import { createNotification } from '@/lib/notifications/notification-service';

export const runtime = 'nodejs';

interface ReferBody {
  title?: unknown;
  openingComment?: unknown;
  linkedSourceType?: unknown;
  linkedSourceId?: unknown;
  agency?: unknown;
}

/**
 * Create a new task and flag it for the Minister's attention. Used by the
 * EscalateModal when the source is a tender / project / agency_issue, and
 * by the "New Minister Referral" button on /minister/attention for
 * sourceless referrals.
 *
 * Flagging an EXISTING task uses POST /api/tasks/[id]/refer instead.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(['superadmin']);
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  let body: ReferBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body.title !== 'string' || !body.title.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }
  if (typeof body.openingComment !== 'string' || !body.openingComment.trim()) {
    return NextResponse.json({ error: 'openingComment is required' }, { status: 400 });
  }

  let linkedSourceType: 'tender' | 'project' | null = null;
  if (body.linkedSourceType === 'tender' || body.linkedSourceType === 'project') {
    linkedSourceType = body.linkedSourceType;
  } else if (body.linkedSourceType != null && body.linkedSourceType !== '') {
    return NextResponse.json(
      { error: "linkedSourceType must be 'tender', 'project', or omitted" },
      { status: 400 },
    );
  }
  const linkedSourceId =
    typeof body.linkedSourceId === 'string' && body.linkedSourceId.trim()
      ? body.linkedSourceId.trim()
      : null;
  if ((linkedSourceType === null) !== (linkedSourceId === null)) {
    return NextResponse.json(
      { error: 'linkedSourceType and linkedSourceId must be set together or both omitted' },
      { status: 400 },
    );
  }
  const agency =
    typeof body.agency === 'string' && body.agency.trim() ? body.agency.trim().toUpperCase() : null;
  const title = body.title.trim();
  const comment = body.openingComment.trim();
  const nowIso = new Date().toISOString();

  // Step 1: insert the task with all the minister-attention columns set.
  const { data: insertedTask, error: insertErr } = await supabaseAdmin
    .from('tasks')
    .insert({
      title,
      status: 'new',
      priority: 'high',
      agency,
      owner_user_id: session.user.id,
      assigned_by_user_id: session.user.id,
      source: 'manual',
      visibility_scope: 'agency_normal',
      requires_minister_attention: true,
      referred_to_minister_at: nowIso,
      referred_to_minister_by: session.user.id,
      linked_source_type: linkedSourceType,
      linked_source_id: linkedSourceId,
    })
    .select('id')
    .single();
  if (insertErr || !insertedTask) {
    logger.error({ err: insertErr }, 'POST /api/tasks/refer step 1 (task insert) failed');
    const msg = insertErr?.message ?? 'Failed to create task';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  const createdTaskId = insertedTask.id as string;

  // Step 2: insert the opening comment. If this fails, attempt to clean up
  // the orphan task we just created.
  const { error: commentErr } = await supabaseAdmin
    .from('task_comments')
    .insert({ task_id: createdTaskId, user_id: session.user.id, body: comment });
  if (commentErr) {
    logger.error(
      { err: commentErr, taskId: createdTaskId },
      'POST /api/tasks/refer step 2 (comment insert) failed; attempting task rollback',
    );
    const { error: rollbackErr } = await supabaseAdmin
      .from('tasks')
      .delete()
      .eq('id', createdTaskId);
    if (rollbackErr) {
      logger.error(
        { err: rollbackErr, taskId: createdTaskId },
        'POST /api/tasks/refer rollback DELETE failed; orphan task left in tasks. Manual cleanup needed.',
      );
    }
    return NextResponse.json(
      { error: commentErr.message ?? 'Failed to write opening comment' },
      { status: 500 },
    );
  }

  // Activity log entries (best-effort, non-blocking).
  void supabaseAdmin
    .from('task_activity')
    .insert([
      { task_id: createdTaskId, user_id: session.user.id, action: 'created', new_value: null },
      {
        task_id: createdTaskId,
        user_id: session.user.id,
        action: 'referred_to_minister',
        new_value: comment.slice(0, 200),
      },
    ])
    .then(({ error }) => {
      if (error) {
        logger.warn(
          { err: error, taskId: createdTaskId },
          'task_activity insert failed (non-fatal)',
        );
      }
    });

  // Step 3: notification fan-out. Non-fatal; the task already exists and the
  // Minister can still see the inbox entry without the notification.
  void (async () => {
    try {
      const { data: ministers } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('role', 'superadmin')
        .eq('is_active', true);
      for (const m of ministers ?? []) {
        await createNotification({
          recipientId: m.id,
          actorId: session.user.id,
          eventType: 'task_referred_to_minister',
          entityType: 'task',
          entityId: createdTaskId,
          title: `Referred to you: ${title}`,
          body: comment.slice(0, 200),
          referenceUrl: `/tasks?taskId=${createdTaskId}`,
        }).catch((notifyErr) => {
          logger.warn(
            { err: notifyErr, taskId: createdTaskId },
            'task_referred_to_minister delivery failed',
          );
        });
      }
    } catch (err) {
      logger.warn(
        { err, taskId: createdTaskId },
        'task_referred_to_minister notification block failed (non-fatal)',
      );
    }
  })();

  return NextResponse.json({ ok: true, taskId: createdTaskId });
}
