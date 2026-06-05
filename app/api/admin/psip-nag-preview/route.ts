import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const result = await requireRole(['superadmin']);
  if (result instanceof NextResponse) return result;

  const sp = request.nextUrl.searchParams;
  const range = sp.get('range') ?? '30d';
  const now = new Date();
  let since: Date | null = null;
  if (range === '7d') since = new Date(now.getTime() - 7 * 86400_000);
  else if (range === '30d') since = new Date(now.getTime() - 30 * 86400_000);
  // range === 'all' → no filter

  let q = supabaseAdmin
    .from('psip_nag_preview')
    .select('id, trigger_kind, agency, recipient_to, recipient_bcc, subject, body, would_have_sent_at, actually_sent, sent_at, sent_error')
    .order('would_have_sent_at', { ascending: false })
    .limit(500);
  if (since) q = q.gte('would_have_sent_at', since.toISOString());

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}
