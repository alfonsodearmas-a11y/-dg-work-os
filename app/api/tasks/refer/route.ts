import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';
import { transaction } from '@/lib/db-pg';
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
 * Create a new task and flag it for the Minister's attention in a single
 * Postgres transaction. Used by the EscalateModal when the source is a
 * tender / project / agency_issue, and by the "New Minister Referral"
 * button on /minister/attention for sourceless referrals.
 *
 * Flagging an EXISTING task uses POST /api/tasks/[id]/refer instead.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(['dg']);
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

  let createdTaskId: string;
  try {
    createdTaskId = await transaction(async (client) => {
      const { rows: taskRows } = await client.query(
        `INSERT INTO tasks (
           title, status, priority, agency, owner_user_id, assigned_by_user_id, source,
           visibility_scope,
           requires_minister_attention, referred_to_minister_at, referred_to_minister_by,
           linked_source_type, linked_source_id
         ) VALUES (
           $1, 'new', 'high', $2, $3, $3, 'manual', 'agency_normal',
           TRUE, $4, $3,
           $5, $6
         )
         RETURNING id`,
        [title, agency, session.user.id, nowIso, linkedSourceType, linkedSourceId],
      );
      const taskId = taskRows[0].id as string;
      await client.query(
        `INSERT INTO task_comments (task_id, user_id, body) VALUES ($1, $2, $3)`,
        [taskId, session.user.id, comment],
      );
      await client.query(
        `INSERT INTO task_activity (task_id, user_id, action, new_value)
         VALUES ($1, $2, 'created', NULL),
                ($1, $2, 'referred_to_minister', $3)`,
        [taskId, session.user.id, comment.slice(0, 200)],
      );
      return taskId;
    });
  } catch (err) {
    logger.error({ err }, 'POST /api/tasks/refer failed');
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Post-commit notification fan-out. Failures are logged but never roll
  // back the referral.
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
      logger.error(
        { err, taskId: createdTaskId },
        'task_referred_to_minister notification block failed',
      );
    }
  })();

  return NextResponse.json({ ok: true, taskId: createdTaskId });
}
