import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { parseProjectsExcelWithDebug } from '@/lib/excel-parser';
import { detectChanges } from '@/lib/change-detector';
import { requireRole } from '@/lib/auth-helpers';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(request: NextRequest) {
  const result = await requireRole(['dg', 'agency_admin']);
  if (result instanceof NextResponse) return result;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File exceeds 10 MB limit' }, { status: 400 });
    }

    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (!['.xlsx', '.xls'].includes(ext)) {
      return NextResponse.json({ error: 'Only .xlsx and .xls files are allowed' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { projects, agency_counts, total_value, debug } = parseProjectsExcelWithDebug(buffer);

    if (projects.length === 0) {
      return NextResponse.json({
        error: 'No valid project data found',
        debug,
      }, { status: 400 });
    }

    // Detect changes before upserting
    let changes = null;
    try {
      changes = await detectChanges(projects);
    } catch {
      // First upload — no existing data
    }

    // Upsert projects (on project_id conflict)
    const { error: upsertError } = await supabaseAdmin
      .from('projects')
      .upsert(
        projects.map(p => ({ ...p, updated_at: new Date().toISOString() })),
        { onConflict: 'project_id', ignoreDuplicates: false }
      );

    if (upsertError) {
      console.error('Upsert error:', upsertError);
      return NextResponse.json({
        error: 'Database error while saving projects',
      }, { status: 500 });
    }

    // Record upload
    await supabaseAdmin.from('project_uploads').insert({
      filename: file.name,
      project_count: projects.length,
    });

    return NextResponse.json({
      success: true,
      project_count: projects.length,
      agency_counts,
      total_value,
      changes,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to process Excel file' },
      { status: 500 }
    );
  }
}
