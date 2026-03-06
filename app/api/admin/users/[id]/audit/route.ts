import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireRole(['dg', 'minister', 'ps']);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from('admin_audit_log')
    .select('*, actor:users!actor_id(name)')
    .eq('target_user_id', id)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const entries = (data || []).map(e => {
    const actor = e.actor as { name: string } | null;
    return { ...e, actor_name: actor?.name || 'System', actor: undefined };
  });

  return NextResponse.json({ entries });
}
