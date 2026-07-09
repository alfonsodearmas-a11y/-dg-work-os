import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db-admin';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole(['superadmin', 'agency_manager']);
  if (result instanceof NextResponse) return result;

  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from('task_activity')
    .select('*, user:users!user_id(name)')
    .eq('task_id', id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const activities = (data || []).map((a) => {
    const user = a.user as { name: string } | null;
    return { ...a, user_name: user?.name || null, user: undefined };
  });

  return NextResponse.json({ activities });
}
