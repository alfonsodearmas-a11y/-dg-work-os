import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { MeetingTypeZ, ModalityZ } from '@/lib/action-items/types';

export const dynamic = 'force-dynamic';

const BodyZ = z.object({
  detected_type: MeetingTypeZ.nullable().optional(),
  detected_modality: ModalityZ.nullable().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireRole(['superadmin']);
  if (a instanceof NextResponse) return a;
  const { id } = await ctx.params;
  const parsed = BodyZ.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const { error } = await supabaseAdmin.from('meetings_seen').update(parsed.data).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
