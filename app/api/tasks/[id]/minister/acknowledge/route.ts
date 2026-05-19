import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';
import { supabaseAdmin } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * Minister acknowledges a referral. Idempotent: re-acknowledging is a no-op.
 * Tasks that are not flagged (or have been closed for the Minister) cannot
 * be acknowledged.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireRole(['minister']);
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  const { data: task, error: selectErr } = await supabaseAdmin
    .from('tasks')
    .select('id, requires_minister_attention, minister_seen_at, minister_closed_at')
    .eq('id', id)
    .maybeSingle();
  if (selectErr) {
    logger.error({ err: selectErr, taskId: id }, 'acknowledge select failed');
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!task.requires_minister_attention || task.minister_closed_at) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (task.minister_seen_at) {
    return NextResponse.json({ ok: true, taskId: id });
  }

  const nowIso = new Date().toISOString();
  const { error: updateErr } = await supabaseAdmin
    .from('tasks')
    .update({ minister_seen_at: nowIso })
    .eq('id', id);
  if (updateErr) {
    logger.error({ err: updateErr, taskId: id }, 'acknowledge update failed');
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }

  void supabaseAdmin
    .from('task_activity')
    .insert({
      task_id: id,
      user_id: session.user.id,
      action: 'minister_acknowledged',
      new_value: nowIso,
    })
    .then(({ error }) => {
      if (error) logger.warn({ err: error, taskId: id }, 'acknowledge activity log failed');
    });

  return NextResponse.json({ ok: true, taskId: id });
}
