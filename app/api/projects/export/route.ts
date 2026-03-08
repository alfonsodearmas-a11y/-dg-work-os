import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';

export async function POST(request: NextRequest) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { project_ids } = await request.json();

    if (!project_ids?.length) {
      return NextResponse.json({ error: 'No projects selected' }, { status: 400 });
    }

    const { data } = await supabaseAdmin
      .from('projects')
      .select('*')
      .in('id', project_ids);

    if (!data?.length) {
      return NextResponse.json({ error: 'No projects found' }, { status: 404 });
    }

    const headers = ['Project ID', 'Project Name', 'Agency', 'Region', 'Contractor', 'Contract Value', 'Completion %', 'End Date', 'Status', 'Health'];
    const rows = data.map(p => {
      const raw = p.project_status || '';
      const status = raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : 'Unknown';
      return [
        p.project_id,
        `"${(p.project_name || '').replace(/"/g, '""')}"`,
        p.sub_agency || '',
        p.region || '',
        `"${(p.contractor || '').replace(/"/g, '""')}"`,
        p.contract_value || '',
        p.completion_pct || 0,
        p.project_end_date || '',
        status,
        p.health || 'green',
      ].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="projects-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Failed to export projects' }, { status: 500 });
  }
}
