import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db-admin';
import { logEvent } from '@/lib/action-items/events';

export const dynamic = 'force-dynamic';

const BodyZ = z.object({ supersedes_id: z.string().uuid() });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireRole(['superadmin']);
  if (a instanceof NextResponse) return a;
  const { id } = await ctx.params;
  const parsed = BodyZ.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const priorId = parsed.data.supersedes_id;

  const now = new Date().toISOString();
  const { error: e1 } = await supabaseAdmin.from('tasks')
    .update({ supersedes_id: priorId, updated_at: now }).eq('id', id);
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

  const { error: e2 } = await supabaseAdmin.from('tasks')
    .update({ status: 'superseded', completed_at: now, updated_at: now }).eq('id', priorId);
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  await logEvent({ taskId: id, eventType: 'supersedes', actorId: a.session.user.id, payload: { prior_id: priorId } });
  await logEvent({ taskId: priorId, eventType: 'superseded_by', actorId: a.session.user.id, payload: { successor_id: id } });

  return NextResponse.json({ ok: true });
}
