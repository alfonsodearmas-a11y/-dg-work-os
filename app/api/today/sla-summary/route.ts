import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { getSlaSummary } from '@/lib/today/sla-summary';

export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const summary = await getSlaSummary(session.user.role, session.user.agency);
  return NextResponse.json(summary);
}
