import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { toTitleCase, formatContractorName, formatRegion, formatStatus } from '@/lib/text-utils';

export async function POST() {
  try {
    // Fetch all projects
    const { data: projects, error: fetchError } = await supabaseAdmin
      .from('projects')
      .select('project_reference, project_name, contractor, region, project_status, remarks');

    if (fetchError) {
      throw new Error(`Failed to fetch projects: ${fetchError.message}`);
    }

    if (!projects || projects.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No projects to update',
        updated: 0
      });
    }

    let updatedCount = 0;
    const errors: string[] = [];

    // Process each project
    for (const project of projects) {
      const updates: Record<string, string | null> = {};
      let needsUpdate = false;

      // Format project name
      const formattedName = toTitleCase(project.project_name);
      if (formattedName !== project.project_name) {
        updates.project_name = formattedName;
        needsUpdate = true;
      }

      // Format contractor
      const formattedContractor = formatContractorName(project.contractor);
      if (formattedContractor !== project.contractor && formattedContractor) {
        updates.contractor = formattedContractor;
        needsUpdate = true;
      }

      // Format region
      const formattedRegion = formatRegion(project.region);
      if (formattedRegion !== project.region && formattedRegion) {
        updates.region = formattedRegion;
        needsUpdate = true;
      }

      // Format status
      const formattedStatus = formatStatus(project.project_status);
      if (formattedStatus !== project.project_status && formattedStatus) {
        updates.project_status = formattedStatus;
        needsUpdate = true;
      }

      // Format remarks
      const formattedRemarks = toTitleCase(project.remarks);
      if (formattedRemarks !== project.remarks && formattedRemarks) {
        updates.remarks = formattedRemarks;
        needsUpdate = true;
      }

      // Update if any changes
      if (needsUpdate) {
        const { error: updateError } = await supabaseAdmin
          .from('projects')
          .update(updates)
          .eq('project_reference', project.project_reference);

        if (updateError) {
          errors.push(`${project.project_reference}: ${updateError.message}`);
        } else {
          updatedCount++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Updated ${updatedCount} of ${projects.length} projects`,
      updated: updatedCount,
      total: projects.length,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined
    });
  } catch (error) {
    console.error('Fix formatting error:', error);
    return NextResponse.json(
      { error: 'Failed to fix formatting', details: String(error) },
      { status: 500 }
    );
  }
}
