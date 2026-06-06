import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { embedTask } from '@/lib/action-items/embeddings/backfill';

export const dynamic = 'force-dynamic';

const BodyZ = z.object({ task_id: z.string().uuid() });

export async function POST(req: NextRequest) {
  const a = await requireRole(['superadmin']);
  if (a instanceof NextResponse) return a;
  const parsed = BodyZ.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  await embedTask(parsed.data.task_id);
  return NextResponse.json({ ok: true });
}
