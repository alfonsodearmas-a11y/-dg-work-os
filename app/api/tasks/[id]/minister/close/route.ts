import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';
import { supabaseAdmin } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * Minister closes a task for their attention. Sets minister_closed_at.
 * The underlying task itself is not closed; it stays on the Kanban for
 * the DG. Idempotent: re-closing returns the existing timestamp.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireRole(['superadmin']);
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  const { data: task, error: selectErr } = await supabaseAdmin
    .from('tasks')
    .select('id, requires_minister_attention, minister_closed_at')
    .eq('id', id)
    .maybeSingle();
  if (selectErr) {
    logger.error({ err: selectErr, taskId: id }, 'minister close select failed');
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
  if (!task || !task.requires_minister_attention) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (task.minister_closed_at) {
    return NextResponse.json({ ok: true, taskId: id });
  }

  const nowIso = new Date().toISOString();
  const { error: updateErr } = await supabaseAdmin
    .from('tasks')
    .update({ minister_closed_at: nowIso })
    .eq('id', id);
  if (updateErr) {
    logger.error({ err: updateErr, taskId: id }, 'minister close update failed');
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }

  void supabaseAdmin
    .from('task_activity')
    .insert({
      task_id: id,
      user_id: session.user.id,
      action: 'minister_closed',
      new_value: nowIso,
    })
    .then(({ error }) => {
      if (error) logger.warn({ err: error, taskId: id }, 'minister close activity log failed');
    });

  return NextResponse.json({ ok: true, taskId: id });
}
