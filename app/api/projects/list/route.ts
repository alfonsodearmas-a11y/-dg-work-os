import { NextRequest, NextResponse } from 'next/server';
import { getProjectsList } from '@/lib/project-queries';
import { requireRole } from '@/lib/auth-helpers';
import { getViewAsAgencyScope } from '@/lib/scoped-query';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(['superadmin', 'agency_manager']);
    if (authResult instanceof NextResponse) return authResult;
    const { session } = authResult;

    const p = request.nextUrl.searchParams;

    // Enforce agency scoping for non-ministry users
    const scope = getViewAsAgencyScope(session, null, null);

    const agencies = p.get('agencies') ? p.get('agencies')!.split(',').filter(Boolean) : undefined;
    const statuses = p.get('statuses') ? p.get('statuses')!.split(',').filter(Boolean) : undefined;
    const regions = p.get('regions') ? p.get('regions')!.split(',').filter(Boolean) : undefined;
    const healths = p.get('healths') ? p.get('healths')!.split(',').filter(Boolean) : undefined;

    // Non-ministry users: enforce their agency, ignore client filter
    // Ministry users: respect client-provided agency filter
    const enforcedAgency = scope ? scope.toUpperCase() : (p.get('agency') || undefined);

    const { projects, total } = await getProjectsList({
      agencies: scope ? undefined : agencies,
      agency: enforcedAgency,
      statuses,
      status: p.get('status') || undefined,
      regions,
      region: p.get('region') || undefined,
      healths,
      budgetMin: p.get('budgetMin') ? Number(p.get('budgetMin')) : undefined,
      budgetMax: p.get('budgetMax') ? Number(p.get('budgetMax')) : undefined,
      contractor: p.get('contractor') || undefined,
      dateField: p.get('dateField') || undefined,
      dateFrom: p.get('dateFrom') || undefined,
      dateTo: p.get('dateTo') || undefined,
      search: p.get('search') || undefined,
      sort: p.get('sort') || undefined,
      escalatedOnly: p.get('escalatedOnly') === 'true',
      page: p.get('page') ? parseInt(p.get('page')!) : undefined,
      limit: p.get('limit') ? parseInt(p.get('limit')!) : undefined,
    });
    return NextResponse.json({ projects, total });
  } catch (error) {
    logger.error({ err: error }, 'Projects list error');
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}
