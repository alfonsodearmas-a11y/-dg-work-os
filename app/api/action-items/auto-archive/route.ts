// app/api/action-items/auto-archive/route.ts
//
// Daily cron. Finds extractions older than 14 days with review_status='pending'
// and stamps 'skipped'. Mandatory and quick-scan items in those extractions are
// counted as rejected (telemetry only; nothing is auto-accepted).
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db';

export const dynamic = 'force-dynamic';

async function handler(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;
  let isAuthed = isCron;
  if (!isAuthed) {
    const session = await auth();
    isAuthed = !!session?.user?.id && session.user.role === 'dg';
  }
  if (!isAuthed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: stale } = await supabaseAdmin
    .from('action_item_extractions')
    .select('id, items_extracted')
    .eq('review_status', 'pending')
    .lt('created_at', cutoff);

  let archived = 0;
  for (const r of stale ?? []) {
    const dropped = r.items_extracted as number;
    await supabaseAdmin
      .from('action_item_extractions')
      .update({
        review_status: 'skipped',
        items_rejected: dropped,
      })
      .eq('id', r.id);
    archived++;
  }
  return NextResponse.json({ archived });
}

export { handler as GET, handler as POST };
