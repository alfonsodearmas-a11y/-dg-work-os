import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { parseBody, apiError } from '@/lib/api-utils';
import { escalateProject, deescalateProject } from '@/lib/project-queries';
import { supabaseAdmin } from '@/lib/db';

const escalateSchema = z.object({
  reason: z.string().min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  const { data, error } = await parseBody(request, escalateSchema);
  if (error) return error;

  try {
    const { id } = await params;

    await escalateProject(id, data.reason.trim(), authResult.session.user.id);

    // Get project details for notification
    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('project_name, sub_agency')
      .eq('id', id)
      .single();

    // Notify ministry-level users (dg, minister, ps)
    const { data: ministryUsers } = await supabaseAdmin
      .from('users')
      .select('id')
      .in('role', ['dg', 'minister', 'ps'])
      .eq('is_active', true);

    if (ministryUsers?.length) {
      const notifications = ministryUsers.map(u => ({
        user_id: u.id,
        type: 'project_escalated',
        title: `Project Escalated: ${project?.project_name || 'Unknown'}`,
        body: data.reason.trim(),
        priority: 'high',
        reference_type: 'project',
        reference_id: id,
        reference_url: `/projects`,
        scheduled_for: new Date().toISOString(),
        category: 'projects',
        source_module: 'projects',
        action_required: true,
      }));
      await supabaseAdmin.from('notifications').insert(notifications);
    }

    if (project?.sub_agency) {
      const { data: agencyDirectors } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('role', 'agency_admin')
        .eq('agency', project.sub_agency)
        .eq('is_active', true);

      if (agencyDirectors?.length) {
        const agencyNotifs = agencyDirectors.map(u => ({
          user_id: u.id,
          type: 'project_escalated',
          title: `Project Escalated: ${project?.project_name || 'Unknown'}`,
          body: data.reason.trim(),
          priority: 'high',
          reference_type: 'project',
          reference_id: id,
          reference_url: `/projects`,
          scheduled_for: new Date().toISOString(),
          category: 'projects',
          source_module: 'projects',
          action_required: true,
        }));
        await supabaseAdmin.from('notifications').insert(agencyNotifs);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Escalate error:', err);
    return apiError('ESCALATE_FAILED', 'Failed to escalate project', 500);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Only dg, minister, ps can de-escalate
  const authResult = await requireRole(['dg', 'minister', 'ps']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await params;
    await deescalateProject(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('De-escalate error:', error);
    return NextResponse.json({ error: 'Failed to de-escalate project' }, { status: 500 });
  }
}
