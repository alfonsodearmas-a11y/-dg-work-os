import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await requireRole(['superadmin']);
  if (result instanceof NextResponse) return result;

  const { data, error } = await supabaseAdmin
    .from('agency_psip_focal_point')
    .select('agency, focal_point_name, focal_point_email, agency_head_name, agency_head_email, updated_at')
    .order('agency', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function PATCH(request: NextRequest) {
  const result = await requireRole(['superadmin']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const agency = String(body.agency ?? '').trim();
  if (!agency) return NextResponse.json({ error: 'agency required' }, { status: 400 });

  const updates: Record<string, string | null> = {};
  for (const field of ['focal_point_name', 'focal_point_email', 'agency_head_name', 'agency_head_email'] as const) {
    if (field in body) {
      const raw = body[field];
      const val = raw === null || raw === '' ? '' : String(raw).trim();
      if (field.endsWith('_email') && val !== '' && !EMAIL_RE.test(val)) {
        return NextResponse.json({ error: `${field} is not a valid email` }, { status: 400 });
      }
      updates[field] = field.startsWith('agency_head') && val === '' ? null : val;
    }
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 });
  }

  // Fetch old values for the audit log.
  const { data: old } = await supabaseAdmin
    .from('agency_psip_focal_point')
    .select('focal_point_name, focal_point_email, agency_head_name, agency_head_email')
    .eq('agency', agency)
    .single();
  if (!old) return NextResponse.json({ error: 'unknown agency' }, { status: 404 });

  const { error: updateErr } = await supabaseAdmin
    .from('agency_psip_focal_point')
    .update({ ...updates, updated_at: new Date().toISOString(), updated_by: session.user.id })
    .eq('agency', agency);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  const historyRows: Array<{ agency: string; field: string; old_value: string | null; new_value: string | null; changed_by: string }> = [];
  for (const [field, newValue] of Object.entries(updates)) {
    const oldValue = (old as Record<string, string | null>)[field] ?? null;
    if (oldValue !== newValue) {
      historyRows.push({ agency, field, old_value: oldValue, new_value: newValue, changed_by: session.user.id });
    }
  }
  if (historyRows.length > 0) {
    await supabaseAdmin.from('agency_psip_focal_point_history').insert(historyRows);
  }

  return NextResponse.json({ success: true, changed: historyRows.length });
}
