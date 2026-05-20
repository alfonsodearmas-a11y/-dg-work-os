import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';
import { transaction } from '@/lib/db-pg';
import { supabaseAdmin } from '@/lib/db';
import { createNotification } from '@/lib/notifications/notification-service';

export const runtime = 'nodejs';

/**
 * Flag an existing task for the Minister's attention. Used when the DG
 * decides an already-tracked task should be elevated. Creates the opening
 * comment, sets the three minister-attention columns, and writes an
 * activity row, all in one Postgres transaction.
 *
 * To create a new task and flag it in the same step (the common path from
 * EscalateModal on a tender / project), use POST /api/tasks/refer instead.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireRole(['dg']);
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

  let taskTitle: string | null = null;
  try {
    taskTitle = await transaction(async (client) => {
      const { rows: existing } = await client.query(
        'SELECT title, requires_minister_attention FROM tasks WHERE id = $1 FOR UPDATE',
        [id],
      );
      if (existing.length === 0) {
        const err = new Error('Task not found');
        (err as Error & { code?: string }).code = 'NOT_FOUND';
        throw err;
      }
      if (existing[0].requires_minister_attention === true) {
        const err = new Error('Task is already referred to Minister');
        (err as Error & { code?: string }).code = 'ALREADY_FLAGGED';
        throw err;
      }
      await client.query(
        `UPDATE tasks
            SET requires_minister_attention = TRUE,
                referred_to_minister_at = $2,
                referred_to_minister_by = $3,
                minister_seen_at = NULL,
                minister_closed_at = NULL
          WHERE id = $1`,
        [id, nowIso, session.user.id],
      );
      await client.query(
        'INSERT INTO task_comments (task_id, user_id, body) VALUES ($1, $2, $3)',
        [id, session.user.id, comment],
      );
      await client.query(
        `INSERT INTO task_activity (task_id, user_id, action, new_value)
         VALUES ($1, $2, 'referred_to_minister', $3)`,
        [id, session.user.id, comment.slice(0, 200)],
      );
      return existing[0].title as string;
    });
  } catch (err) {
    const code = (err as Error & { code?: string }).code;
    if (code === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    if (code === 'ALREADY_FLAGGED') {
      return NextResponse.json({ error: 'Task is already referred to Minister' }, { status: 409 });
    }
    logger.error({ err, taskId: id }, 'POST /api/tasks/[id]/refer failed');
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Post-commit notification fan-out.
  void (async () => {
    try {
      const { data: ministers } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('role', 'minister')
        .eq('is_active', true);
      for (const m of ministers ?? []) {
        await createNotification({
          recipientId: m.id,
          actorId: session.user.id,
          eventType: 'task_referred_to_minister',
          entityType: 'task',
          entityId: id,
          title: `Referred to you: ${taskTitle ?? 'task'}`,
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
      logger.error({ err, taskId: id }, 'task_referred_to_minister notification block failed');
    }
  })();

  return NextResponse.json({ ok: true, taskId: id });
}
