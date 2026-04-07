import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { getOversightProjects, type OversightFilters } from '@/lib/oversight-queries';
import { getDaysOverdue } from '@/components/oversight/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'parl_sec', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  const userRole = session.user.role;
  const userAgency = session.user.agency;
  let agencyFilter: string | undefined;
  if (userRole === 'agency_admin' || userRole === 'officer') {
    agencyFilter = userAgency || undefined;
  }

  let body: Record<string, string> = {};
  try { body = await request.json(); } catch {}

  const filters: OversightFilters = {
    sub_agencies: body.sub_agencies?.split(',').filter(Boolean),
    regions: body.regions?.split(',').filter(Boolean).map(Number).filter((n) => !isNaN(n)),
    completion_min: body.completion_min ? Number(body.completion_min) : undefined,
    completion_max: body.completion_max ? Number(body.completion_max) : undefined,
    end_date_from: body.end_date_from || undefined,
    end_date_to: body.end_date_to || undefined,
    contractor_search: body.contractor_search || undefined,
    search: body.search || undefined,
    sort: body.sort || 'value',
    sort_dir: (body.sort_dir as 'asc' | 'desc') || 'desc',
    page: 1,
    limit: 1000,
  };

  const { projects } = await getOversightProjects(filters, agencyFilter);

  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;

  const headers = ['Project ID', 'Project Name', 'Agency', 'Region', 'Contract Value', 'Contractors', 'End Date', 'Completion %', 'Days Overdue', 'Last Synced'];
  const csvRows = projects.map((p) => [
    p.project_id,
    esc(p.project_name || ''),
    p.sub_agency,
    p.region ?? '',
    p.contract_value_total ?? '',
    esc((p.contractors || []).join('; ')),
    p.project_end_date || '',
    p.completion_percent,
    getDaysOverdue(p.project_end_date) ?? '',
    p.last_synced_at ? new Date(p.last_synced_at).toISOString().slice(0, 10) : '',
  ].join(','));

  const csv = [headers.join(','), ...csvRows].join('\n');
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="delayed-projects-${date}.csv"`,
    },
  });
}
