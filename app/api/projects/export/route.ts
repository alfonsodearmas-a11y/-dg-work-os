import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { parseBody, apiError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';

const exportSchema = z.object({
  project_ids: z.array(z.string().min(1)).min(1),
});

export async function POST(request: NextRequest) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  const { data, error } = await parseBody(request, exportSchema);
  if (error) return error;

  try {
    const { project_ids } = data;

    const { data: projects } = await supabaseAdmin
      .from('projects')
      .select('project_id, project_name, sub_agency, region, contractor, contract_value, completion_pct, project_end_date, project_status, health')
      .in('id', project_ids);

    if (!projects?.length) {
      return NextResponse.json({ error: 'No projects found' }, { status: 404 });
    }

    const headers = ['Project ID', 'Project Name', 'Agency', 'Region', 'Contractor', 'Contract Value', 'Completion %', 'End Date', 'Status', 'Health'];
    const rows = projects.map(p => {
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
  } catch (err) {
    logger.error({ err }, 'Project export failed');
    return apiError('EXPORT_FAILED', 'Failed to export projects', 500);
  }
}
