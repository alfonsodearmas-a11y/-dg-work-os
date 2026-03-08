import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { parseBody, apiError } from '@/lib/api-utils';
import { bulkUpdateProjects } from '@/lib/project-queries';
import { supabaseAdmin } from '@/lib/db';

const bulkUpdateSchema = z.object({
  project_ids: z.array(z.string().min(1)).min(1),
  health: z.enum(['green', 'yellow', 'red']).optional(),
  assigned_to: z.string().nullable().optional(),
});

export async function PATCH(request: NextRequest) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  const { data, error } = await parseBody(request, bulkUpdateSchema);
  if (error) return error;

  try {
    const session = authResult.session;
    const { project_ids, health, assigned_to } = data;

    const role = session.user.role;
    const userAgency = session.user.agency;

    if (role === 'agency_admin' || role === 'officer') {
      // Verify all projects belong to user's agency (or are assigned to them)
      const { data: projects } = await supabaseAdmin
        .from('projects')
        .select('id, sub_agency, assigned_to')
        .in('id', project_ids);

      const unauthorized = (projects || []).filter(p => {
        if (role === 'officer') return p.assigned_to !== session.user.id;
        return p.sub_agency !== userAgency;
      });

      if (unauthorized.length > 0) {
        return NextResponse.json({ error: 'You do not have permission to update some of the selected projects' }, { status: 403 });
      }
    }

    const updates: Record<string, any> = {};
    if (health) updates.health = health;
    if (assigned_to !== undefined) updates.assigned_to = assigned_to || null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    await bulkUpdateProjects(project_ids, updates);
    return NextResponse.json({ success: true, updated: project_ids.length });
  } catch (err) {
    console.error('Bulk update error:', err);
    return apiError('BULK_UPDATE_FAILED', 'Failed to bulk update projects', 500);
  }
}
