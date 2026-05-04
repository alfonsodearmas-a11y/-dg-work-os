import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { logEvent } from '@/lib/action-items/events';
import { insertNotification } from '@/lib/notifications';
import { logger } from '@/lib/logger';

const BodyZ = z.object({ note: z.string().min(20).max(1000) });
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(['dg']);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const parsed = BodyZ.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Note must be 20–1000 chars' }, { status: 400 });

  const { data: task } = await supabaseAdmin
    .from('tasks')
    .select('id, status, owner_user_id, title, completion_note, completed_at')
    .eq('id', id).maybeSingle();
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (task.status !== 'awaiting_verification') {
    return NextResponse.json({ error: `Cannot dispute from "${task.status}"` }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { error: updErr } = await supabaseAdmin
    .from('tasks')
    .update({
      status: 'active',
      dispute_note: parsed.data.note,
      disputed_at: now,
      // Per spec §10.5 step 3: clear completion fields from live row (preserved in event).
      completed_by: null, completed_at: null, completion_note: null,
      updated_at: now,
    })
    .eq('id', id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  await logEvent({
    taskId: id, eventType: 'dispute_raised', actorId: auth.session.user.id,
    payload: {
      completion_note: task.completion_note,
      dispute_note: parsed.data.note,
      prior_completed_at: task.completed_at,
    },
  });

  try {
    const titleShort = (task.title as string).slice(0, 60);
    await insertNotification({
      user_id: task.owner_user_id as string,
      type: 'task_disputed',
      title: `Task disputed: ${titleShort}`,
      body: parsed.data.note.slice(0, 120),
      icon: null,
      priority: 'high',
      reference_type: 'task',
      reference_id: id,
      reference_url: `/tasks?focus=${id}`,
      scheduled_for: now,
      category: 'tasks',
      source_module: 'action-items',
      action_required: true,
      actor_id: auth.session.user.id,
      event_type: 'task_disputed',
      importance_tier: 'critical',
      entity_type: 'task',
      entity_id: id,
    });
  } catch (err) {
    logger.error({ err, taskId: id }, 'dispute notification failed (non-fatal)');
  }
  return NextResponse.json({ ok: true });
}
