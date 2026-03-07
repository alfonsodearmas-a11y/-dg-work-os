import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { checkPermission } from '@/lib/people-permissions';

export async function GET(request: NextRequest) {
  const authResult = await requireRole(['dg', 'minister', 'ps']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  const hasPermission = await checkPermission(session.user.id, 'audit.read');
  if (!hasPermission) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const objectType = searchParams.get('objectType');
  const objectId = searchParams.get('objectId');
  const action = searchParams.get('action');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  let query = supabaseAdmin
    .from('activity_logs')
    .select('*, users!activity_logs_user_id_fkey(name, email)')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (userId) query = query.eq('user_id', userId);
  if (objectType) query = query.eq('object_type', objectType);
  if (objectId) query = query.eq('object_id', objectId);
  if (action) query = query.eq('action', action);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const logs = (data || []).map((row: Record<string, unknown>) => {
    const user = row.users as { name: string; email: string } | null;
    return {
      ...row,
      user_name: user?.name || 'Unknown',
      user_email: user?.email || '',
      users: undefined,
    };
  });

  return NextResponse.json({ logs });
}
