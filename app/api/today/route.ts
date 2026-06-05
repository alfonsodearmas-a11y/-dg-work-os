import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { getTodaySignals } from '@/lib/today/signals';

export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await requireRole(['superadmin', 'agency_manager']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const payload = await getTodaySignals(
    session.user.id,
    session.user.role,
    session.user.agency,
  );

  return NextResponse.json(payload);
}
