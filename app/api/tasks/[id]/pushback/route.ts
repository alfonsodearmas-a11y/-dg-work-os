import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db';
import { logEvent } from '@/lib/action-items/events';
import { insertNotification } from '@/lib/notifications';
import { logger } from '@/lib/logger';

const BodyZ = z.object({ text: z.string().min(20).max(1000) });
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = BodyZ.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Comment must be 20–1000 chars' }, { status: 400 });

  const { data: task } = await supabaseAdmin
    .from('tasks').select('id, status, owner_user_id, dispute_note, title').eq('id', id).maybeSingle();
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (task.owner_user_id !== session.user.id) return NextResponse.json({ error: 'Not your task' }, { status: 403 });
  if (task.status !== 'active' || !task.dispute_note) {
    return NextResponse.json({ error: 'Task is not in a disputed state' }, { status: 409 });
  }

  // Pushback only logs an event (spec §10.5 owner option B). No live-row mutation.
  await logEvent({
    taskId: id, eventType: 'dispute_resolved', actorId: session.user.id,
    payload: { action: 'pushback', text: parsed.data.text },
  });

  const { data: dgUsers } = await supabaseAdmin
    .from('users').select('id').eq('role', 'dg').eq('is_active', true);
  const now = new Date().toISOString();
  for (const dg of dgUsers ?? []) {
    try {
      await insertNotification({
        user_id: dg.id as string,
        type: 'task_pushback',
        title: `Pushback: ${(task.title as string).slice(0, 60)}`,
        body: parsed.data.text.slice(0, 120),
        icon: null,
        priority: 'high',
        reference_type: 'task',
        reference_id: id,
        reference_url: `/tasks?focus=${id}`,
        scheduled_for: now,
        category: 'tasks',
        source_module: 'action-items',
        action_required: true,
        actor_id: session.user.id,
        event_type: 'task_pushback',
        importance_tier: 'important',
        entity_type: 'task',
        entity_id: id,
      });
    } catch (err) {
      logger.error({ err, taskId: id, dg: dg.id }, 'pushback notification failed (non-fatal)');
    }
  }
  return NextResponse.json({ ok: true });
}
