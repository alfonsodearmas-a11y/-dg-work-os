import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { runExtraction } from '@/lib/action-items/extraction/extract';
import { ModalityZ } from '@/lib/action-items/types';

export const dynamic = 'force-dynamic';

const BodyZ = z.object({
  fireflies_meeting_id: z.string().min(1),
  modality: ModalityZ,
});

export async function POST(req: NextRequest) {
  const a = await requireRole(['dg', 'ps']);
  if (a instanceof NextResponse) return a;
  const parsed = BodyZ.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  if (parsed.data.modality !== 'virtual') {
    return NextResponse.json({ error: 'Only virtual extraction is wired in v1' }, { status: 400 });
  }
  try {
    const r = await runExtraction({
      fireflies_meeting_id: parsed.data.fireflies_meeting_id,
      modality: parsed.data.modality,
    });
    return NextResponse.json(r);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
