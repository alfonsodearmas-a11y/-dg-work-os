import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db-admin';
import { logEvent } from '@/lib/action-items/events';

const BodyZ = z.object({ note: z.string().min(10).max(500) });
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = BodyZ.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Note must be 10–500 chars' }, { status: 400 });

  const { data: task } = await supabaseAdmin
    .from('tasks').select('id, owner_user_id, status').eq('id', id).maybeSingle();
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // dg_managed users (Minister, PS, parl_sec, President) cannot self-close (spec §10.4).
  const { data: owner } = await supabaseAdmin
    .from('users').select('closure_mode').eq('id', task.owner_user_id).maybeSingle();
  if (owner?.closure_mode === 'dg_managed') {
    return NextResponse.json({ error: 'This task is DG-managed; only DG can close it.' }, { status: 403 });
  }

  if (task.owner_user_id !== session.user.id) {
    return NextResponse.json({ error: 'Not your task' }, { status: 403 });
  }
  if (!['new', 'active'].includes(task.status as string)) {
    return NextResponse.json({ error: `Cannot complete from status "${task.status}"` }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { error: updErr } = await supabaseAdmin
    .from('tasks')
    .update({
      status: 'awaiting_verification',
      completed_by: session.user.id,
      completed_at: now,
      completion_note: parsed.data.note,
      // Re-attempt after a dispute clears the dispute markers (history preserved in events).
      dispute_note: null,
      disputed_at: null,
      updated_at: now,
    })
    .eq('id', id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  await logEvent({
    taskId: id, eventType: 'status_change', actorId: session.user.id,
    payload: { from: task.status, to: 'awaiting_verification', via: 'owner_self_close', completion_note: parsed.data.note },
  });
  return NextResponse.json({ ok: true });
}
