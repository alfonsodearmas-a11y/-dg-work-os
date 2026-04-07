import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { getOversightProjects, type OversightFilters } from '@/lib/oversight-queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'parl_sec', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  const sp = request.nextUrl.searchParams;

  const userRole = session.user.role;
  const userAgency = session.user.agency;
  let agencyFilter: string | undefined;
  if (userRole === 'agency_admin' || userRole === 'officer') {
    agencyFilter = userAgency || undefined;
  }

  const filters: OversightFilters = {
    sub_agencies: sp.get('sub_agencies')?.split(',').filter(Boolean),
    regions: sp.get('regions')?.split(',').filter(Boolean).map(Number).filter((n) => !isNaN(n)),
    completion_min: sp.get('completion_min') ? Number(sp.get('completion_min')) : undefined,
    completion_max: sp.get('completion_max') ? Number(sp.get('completion_max')) : undefined,
    end_date_from: sp.get('end_date_from') || undefined,
    end_date_to: sp.get('end_date_to') || undefined,
    contractor_search: sp.get('contractor_search') || undefined,
    search: sp.get('search') || undefined,
    sort: sp.get('sort') || undefined,
    sort_dir: (sp.get('sort_dir') as 'asc' | 'desc') || undefined,
    page: sp.get('page') ? Number(sp.get('page')) : 1,
    limit: sp.get('limit') ? Number(sp.get('limit')) : 25,
  };

  const result = await getOversightProjects(filters, agencyFilter);

  return NextResponse.json(result);
}
