import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db-admin';
import { runExtraction } from '@/lib/action-items/extraction/extract';
import { ModalityZ } from '@/lib/action-items/types';

export const dynamic = 'force-dynamic';
// Long-running endpoint: chunked Anthropic calls + Fireflies fetch. The
// project-wide app/api/** maxDuration of 60s in vercel.json killed the
// management-meeting extraction at 21:14 on 2026-05-05 before any
// persistence could fire. 300s matches the current Vercel platform
// default and gives Anthropic room on long transcripts.
export const maxDuration = 300;

const BodyZ = z.object({
  fireflies_meeting_id: z.string().min(1),
  modality: ModalityZ,
});

export async function POST(req: NextRequest) {
  const a = await requireRole(['superadmin']);
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
    // Persist the failure here too. runExtraction writes failed_extractions
    // for typed errors (claude_error, transcript_unavailable), but anything
    // that throws above that — Fireflies network blip, OpenAI key error,
    // unexpected schema mismatch — was previously eaten by the 500
    // response with no DB trace. Persist before returning so the user can
    // see why on the meetings page next time.
    const message = err instanceof Error ? err.message : 'Failed';
    await supabaseAdmin.from('failed_extractions').insert({
      fireflies_meeting_id: parsed.data.fireflies_meeting_id,
      failure_reason: 'other',
      failure_detail: message.slice(0, 2000),
    }).then(() => undefined, () => undefined);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
