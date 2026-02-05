import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';

export async function POST() {
  try {
    // Delete all project snapshots first (foreign key constraint)
    await supabaseAdmin
      .from('project_snapshots')
      .delete()
      .neq('project_reference', '');

    // Delete all project uploads
    await supabaseAdmin
      .from('project_uploads')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    // Delete all projects
    const { error } = await supabaseAdmin
      .from('projects')
      .delete()
      .neq('project_reference', '');

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: 'All project data cleared'
    });
  } catch (error) {
    console.error('Clear projects error:', error);
    return NextResponse.json(
      { error: 'Failed to clear projects', details: String(error) },
      { status: 500 }
    );
  }
}
