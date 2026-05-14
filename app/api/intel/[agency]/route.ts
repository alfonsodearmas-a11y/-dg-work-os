import { NextRequest, NextResponse } from 'next/server';
import { requireRole, canAccessAgency } from '@/lib/auth-helpers';
import { getAgencyIntelData } from '@/lib/intel/get-agency-intel-data';
import { isIntelAgency } from '@/lib/agencies';
import { logger } from '@/lib/logger';

/**
 * GET /api/intel/[agency]
 *
 * Returns the operational view for one agency:
 *   { open_tasks[], delayed_projects[], critical_procurement[], gpl?: {…}, agency_head: {…} }
 *
 * Live-feel without stampede risk: the route is dynamic per request, but the
 * Cache-Control header gives the CDN a 60s shared window with stale-while-revalidate.
 * Both this route and /api/intel/[agency]/report call the shared
 * lib/intel/get-agency-intel-data.ts directly — never via internal HTTP.
 */
export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ agency: string }> },
) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const { agency } = await params;
  const lower = agency.toLowerCase();
  if (!isIntelAgency(lower)) {
    return NextResponse.json({ error: 'Unknown agency' }, { status: 404 });
  }

  if (!canAccessAgency(session.user.role, session.user.agency, lower)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  try {
    const data = await getAgencyIntelData(lower);
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'private, max-age=0, s-maxage=60, stale-while-revalidate=120',
      },
    });
  } catch (err) {
    logger.error({ err, agency: lower }, '[/api/intel/[agency]] fetch failed');
    return NextResponse.json({ error: 'Failed to load agency intel' }, { status: 500 });
  }
}
