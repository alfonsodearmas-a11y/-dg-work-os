import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await requireRole(['dg']);
  if (result instanceof NextResponse) return result;
  const { data, error } = await supabaseAdmin
    .from('psip_nag_settings')
    .select('emails_enabled, bcc_to_dg, updated_at, updated_by')
    .eq('id', 1)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest) {
  const result = await requireRole(['dg']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const updates: Record<string, boolean | string> = {};
  if ('emails_enabled' in body) updates.emails_enabled = Boolean(body.emails_enabled);
  if ('bcc_to_dg' in body) updates.bcc_to_dg = Boolean(body.bcc_to_dg);
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 });
  }
  updates.updated_at = new Date().toISOString();
  updates.updated_by = session.user.id;

  const { error } = await supabaseAdmin.from('psip_nag_settings').update(updates).eq('id', 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
