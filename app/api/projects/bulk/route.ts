import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { bulkUpdateProjects } from '@/lib/project-queries';
import { supabaseAdmin } from '@/lib/db';

export async function PATCH(request: NextRequest) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const session = authResult.session;
    const { project_ids, health, assigned_to } = await request.json();

    if (!project_ids?.length) {
      return NextResponse.json({ error: 'No projects selected' }, { status: 400 });
    }

    // Role-based access check
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
  } catch (error) {
    console.error('Bulk update error:', error);
    return NextResponse.json({ error: 'Failed to bulk update projects' }, { status: 500 });
  }
}
