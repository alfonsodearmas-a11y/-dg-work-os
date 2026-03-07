import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { recalculateAllHealth } from '@/lib/project-queries';

export async function POST() {
  const session = await requireRole(['dg', 'minister', 'ps', 'agency_admin']);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await recalculateAllHealth();
  return NextResponse.json(result);
}
