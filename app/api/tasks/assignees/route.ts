import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;

  // Get distinct owners from meeting_actions + user names
  const [actionsResult, usersResult] = await Promise.all([
    supabaseAdmin
      .from('meeting_actions')
      .select('owner')
      .not('owner', 'is', null)
      .limit(200),
    supabaseAdmin
      .from('users')
      .select('name')
      .eq('is_active', true)
      .not('name', 'is', null),
  ]);

  const names = new Set<string>();
  for (const row of actionsResult.data || []) {
    if (row.owner?.trim()) names.add(row.owner.trim());
  }
  for (const row of usersResult.data || []) {
    if (row.name?.trim()) names.add(row.name.trim());
  }

  return NextResponse.json({ assignees: [...names].sort() });
}
