import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { logEvent } from '@/lib/action-items/events';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(['dg']);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  const { data: task } = await supabaseAdmin
    .from('tasks').select('id, status').eq('id', id).maybeSingle();
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (task.status !== 'awaiting_verification') {
    return NextResponse.json({ error: `Cannot verify from "${task.status}"` }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { error: updErr } = await supabaseAdmin
    .from('tasks')
    .update({
      status: 'done',
      verified_by: auth.session.user.id,
      verified_at: now,
      updated_at: now,
    })
    .eq('id', id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  await logEvent({
    taskId: id, eventType: 'status_change', actorId: auth.session.user.id,
    payload: { from: 'awaiting_verification', to: 'done', via: 'dg_verify' },
  });
  return NextResponse.json({ ok: true });
}
