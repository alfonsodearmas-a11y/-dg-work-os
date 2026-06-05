import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { getProjects } from '@/lib/delayed-projects/queries';
import { fmtCurrency, fmtDate } from '@/components/oversight/types';
import type { RegistryFilters } from '@/lib/delayed-projects/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const authResult = await requireRole(['superadmin', 'agency_manager']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  const userRole = session.user.role;
  const userAgency = session.user.agency;
  let agencyFilter: string | undefined;
  if (userRole === 'agency_manager') {
    agencyFilter = userAgency || undefined;
  }

  let body: Record<string, string> = {};
  try {
    body = await request.json();
  } catch {
    // No filters — export all
  }

  const filters: RegistryFilters = {
    sub_agencies: body.sub_agencies?.split(',').filter(Boolean),
    regions: body.regions?.split(',').filter(Boolean),
    search: body.search || undefined,
    sort: body.sort || 'contract_value',
    sort_dir: (body.sort_dir as 'asc' | 'desc') || 'desc',
    page: 1,
    limit: 1000,
  };

  const { projects } = await getProjects(filters, agencyFilter);

  // Build CSV
  const headers = [
    'Project Reference',
    'Project Name',
    'Sub Agency',
    'Region',
    'Contract Value',
    'Completion %',
    'Days Overdue',
    'Risk Tier',
    'Contractor(s)',
    'End Date',
    'Status',
  ];

  const csvRows = [headers.join(',')];

  for (const p of projects) {
    const row = [
      `"${p.project_reference}"`,
      `"${(p.project_name || '').replace(/"/g, '""')}"`,
      p.sub_agency,
      p.region || '',
      fmtCurrency(p.contract_value / 100),
      p.completion_percent,
      p.days_overdue !== null ? Math.max(p.days_overdue, 0) : 'N/A',
      p.risk_tier,
      `"${(p.contractors || '').replace(/"/g, '""')}"`,
      fmtDate(p.project_end_date),
      p.status,
    ];
    csvRows.push(row.join(','));
  }

  const csv = csvRows.join('\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="delayed-projects-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
