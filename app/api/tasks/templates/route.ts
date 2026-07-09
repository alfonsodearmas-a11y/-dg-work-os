import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await requireRole(['superadmin', 'agency_manager']);
  if (result instanceof NextResponse) return result;

  const { data, error } = await supabaseAdmin
    .from('task_templates')
    .select('id, name, description, agency_slug, priority, checklist')
    .order('name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ templates: data || [] });
}
