import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { getDelayedSummary } from '@/lib/oversight-queries';

export const dynamic = 'force-dynamic';

export async function GET() {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'parl_sec', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  const userRole = session.user.role;
  const userAgency = session.user.agency;
  let agencyFilter: string | undefined;
  if (userRole === 'agency_admin' || userRole === 'officer') {
    agencyFilter = userAgency || undefined;
  }

  const summary = await getDelayedSummary(agencyFilter);

  return NextResponse.json(summary);
}
