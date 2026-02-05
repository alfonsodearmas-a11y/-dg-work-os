import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';

const KNOWN_AGENCIES = ['GPL', 'GWI', 'HECI', 'CJIA', 'MARAD', 'GCAA', 'MOPUA', 'HAS'];

function extractAgencyFromReference(reference: string): string | null {
  if (!reference) return null;

  const upperRef = reference.toUpperCase();
  for (const agency of KNOWN_AGENCIES) {
    if (upperRef.startsWith(agency)) {
      return agency;
    }
  }

  const match = upperRef.match(/^([A-Z]+?)(?:XX|X?\d)/);
  if (match && match[1]) {
    return match[1];
  }

  return null;
}

export async function POST() {
  try {
    // Get all projects
    const { data: projects, error } = await supabaseAdmin
      .from('projects')
      .select('id, project_reference, sub_agency');

    if (error) throw error;

    let updated = 0;
    const agencyCounts: Record<string, number> = {};

    for (const project of projects || []) {
      const agency = extractAgencyFromReference(project.project_reference);

      if (agency) {
        agencyCounts[agency] = (agencyCounts[agency] || 0) + 1;

        if (project.sub_agency !== agency) {
          await supabaseAdmin
            .from('projects')
            .update({ sub_agency: agency })
            .eq('id', project.id);
          updated++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      totalProjects: projects?.length || 0,
      updated,
      agencyCounts
    });
  } catch (error) {
    console.error('Fix agencies error:', error);
    return NextResponse.json(
      { error: 'Failed to fix agencies' },
      { status: 500 }
    );
  }
}
