import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await requireRole(['superadmin', 'agency_manager']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const today = new Date().toISOString().split('T')[0];

  const { count, error } = await supabaseAdmin
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('owner_user_id', session.user.id)
    .lt('due_date', today)
    .not('status', 'in', '("done","superseded")');

  if (error) {
    return NextResponse.json({ count: 0 }, { status: 500 });
  }

  return NextResponse.json(
    { count: count ?? 0 },
    {
      headers: {
        'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
      },
    },
  );
}
