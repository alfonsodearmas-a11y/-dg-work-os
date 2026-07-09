// NOTE: This route uses sequential supabaseAdmin writes instead of pg transaction()
// because lib/db-pg.ts has a TLS config issue in production (self-signed cert in chain).
// Atomicity tradeoff: a failure between step 1 (UPDATE the task with the flag) and
// step 2 (INSERT the opening comment) can leave a task flagged without an opening
// comment. Step 2 attempts an UPDATE rollback when it fails.
// TODO: revert to transaction() once lib/db-pg.ts TLS issue is resolved.

import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';
import { supabaseAdmin } from '@/lib/db-admin';
import { createNotification } from '@/lib/notifications/notification-service';

export const runtime = 'nodejs';

/**
 * Flag an existing task for the Minister's attention. Used when the DG
 * decides an already-tracked task should be elevated.
 *
 * To create a new task and flag it in the same step (the common path from
 * EscalateModal on a tender / project), use POST /api/tasks/refer instead.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireRole(['superadmin']);
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  let body: { openingComment?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (typeof body.openingComment !== 'string' || !body.openingComment.trim()) {
    return NextResponse.json({ error: 'openingComment is required' }, { status: 400 });
  }
  const comment = body.openingComment.trim();
  const nowIso = new Date().toISOString();

  // Preflight: load the task to validate state + capture title for the
  // notification body. Done as a separate read; not racing with concurrent
  // refers because the existing-task refer is a rare DG action.
  const { data: existing, error: selectErr } = await supabaseAdmin
    .from('tasks')
    .select('title, requires_minister_attention')
    .eq('id', id)
    .maybeSingle();
  if (selectErr) {
    logger.error({ err: selectErr, taskId: id }, 'POST /api/tasks/[id]/refer select failed');
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }
  if (existing.requires_minister_attention === true) {
    return NextResponse.json({ error: 'Task is already referred to Minister' }, { status: 409 });
  }
  const taskTitle = existing.title as string;

  // Step 1: flip the flag and set the three minister-attention columns.
  const { error: updateErr } = await supabaseAdmin
    .from('tasks')
    .update({
      requires_minister_attention: true,
      referred_to_minister_at: nowIso,
      referred_to_minister_by: session.user.id,
      minister_seen_at: null,
      minister_closed_at: null,
    })
    .eq('id', id);
  if (updateErr) {
    logger.error({ err: updateErr, taskId: id }, 'POST /api/tasks/[id]/refer step 1 (flag UPDATE) failed');
    return NextResponse.json({ error: updateErr.message ?? 'Failed to flag task' }, { status: 500 });
  }

  // Step 2: insert the opening comment. If this fails, roll the flag back
  // so the task is not left flagged without a comment.
  const { error: commentErr } = await supabaseAdmin
    .from('task_comments')
    .insert({ task_id: id, user_id: session.user.id, body: comment });
  if (commentErr) {
    logger.error(
      { err: commentErr, taskId: id },
      'POST /api/tasks/[id]/refer step 2 (comment insert) failed; attempting flag rollback',
    );
    const { error: rollbackErr } = await supabaseAdmin
      .from('tasks')
      .update({
        requires_minister_attention: false,
        referred_to_minister_at: null,
        referred_to_minister_by: null,
      })
      .eq('id', id);
    if (rollbackErr) {
      logger.error(
        { err: rollbackErr, taskId: id },
        'POST /api/tasks/[id]/refer rollback UPDATE failed; task left flagged without an opening comment. Manual fix needed.',
      );
    }
    return NextResponse.json(
      { error: commentErr.message ?? 'Failed to write opening comment' },
      { status: 500 },
    );
  }

  // Activity log (best-effort, non-blocking).
  void supabaseAdmin
    .from('task_activity')
    .insert({
      task_id: id,
      user_id: session.user.id,
      action: 'referred_to_minister',
      new_value: comment.slice(0, 200),
    })
    .then(({ error }) => {
      if (error) {
        logger.warn(
          { err: error, taskId: id },
          'task_activity insert failed (non-fatal)',
        );
      }
    });

  // Step 3: notification fan-out. Non-fatal.
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
          entityId: id,
          title: `Referred to you: ${taskTitle}`,
          body: comment.slice(0, 200),
          referenceUrl: `/tasks?taskId=${id}`,
        }).catch((notifyErr) => {
          logger.warn(
            { err: notifyErr, taskId: id },
            'task_referred_to_minister delivery failed',
          );
        });
      }
    } catch (err) {
      logger.warn(
        { err, taskId: id },
        'task_referred_to_minister notification block failed (non-fatal)',
      );
    }
  })();

  return NextResponse.json({ ok: true, taskId: id });
}
