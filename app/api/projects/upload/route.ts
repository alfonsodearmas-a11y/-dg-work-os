import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { parseProjectsExcelWithDebug } from '@/lib/excel-parser';
import { detectChanges } from '@/lib/change-detector';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Parse Excel with debug info
    const { projects, dataQuality, debug } = parseProjectsExcelWithDebug(buffer);

    console.log('=== EXCEL PARSE RESULTS ===');
    console.log('Parsed projects count:', projects.length);
    console.log('Sheet names:', debug.sheetNames);
    console.log('Header row:', debug.headerRow);
    console.log('Mapped columns:', JSON.stringify(debug.mappedColumns, null, 2));

    if (projects.length > 0) {
      console.log('First project:', JSON.stringify(projects[0], null, 2));
    }

    if (projects.length === 0) {
      return NextResponse.json(
        {
          error: 'No valid project data found in file',
          debug: {
            sheetNames: debug.sheetNames,
            headerRow: debug.headerRow,
            headersFound: debug.headers.slice(0, 20),
            mappedColumns: debug.mappedColumns,
            totalRows: debug.totalRows,
            hint: 'The file should have columns like: Project Reference, Project Name, Status, Agency, etc.'
          }
        },
        { status: 400 }
      );
    }

    // Detect changes (compare with existing data)
    let changes = null;
    try {
      changes = await detectChanges(projects);
    } catch (changeError) {
      console.log('Change detection skipped (likely empty table):', changeError);
    }

    // Create snapshots - batch insert for efficiency
    const today = new Date().toISOString().split('T')[0];
    const snapshots = projects.map(project => ({
      project_reference: project.project_reference,
      snapshot_date: today,
      completion_percent: project.completion_percent,
      project_status: project.project_status,
      total_expenditure: project.total_expenditure,
      raw_data: project
    }));

    const { error: snapshotError } = await supabaseAdmin
      .from('project_snapshots')
      .insert(snapshots);

    if (snapshotError) {
      console.warn('Snapshot insert warning:', snapshotError.message);
      // Don't fail on snapshot errors - continue with main insert
    }

    // Insert/upsert projects - process in batches for reliability
    const projectsToInsert = projects.map(project => ({
      ...project,
      last_updated: new Date().toISOString()
    }));

    console.log('=== INSERTING PROJECTS ===');
    console.log('Projects to insert:', projectsToInsert.length);

    // Try upsert first (handles both insert and update)
    const { data: upsertedData, error: upsertError } = await supabaseAdmin
      .from('projects')
      .upsert(projectsToInsert, {
        onConflict: 'project_reference',
        ignoreDuplicates: false
      })
      .select();

    if (upsertError) {
      console.error('=== UPSERT ERROR ===');
      console.error('Error code:', upsertError.code);
      console.error('Error message:', upsertError.message);
      console.error('Error details:', upsertError.details);

      return NextResponse.json(
        {
          error: `Database error: ${upsertError.message}`,
          code: upsertError.code,
          details: upsertError.details
        },
        { status: 500 }
      );
    }

    console.log('=== UPSERT SUCCESS ===');
    console.log('Upserted rows:', upsertedData?.length || 'unknown');

    // Record upload
    const { error: uploadRecordError } = await supabaseAdmin
      .from('project_uploads')
      .insert({
        filename: file.name,
        row_count: projects.length,
        changes_summary: changes
      });

    if (uploadRecordError) {
      console.warn('Upload record warning:', uploadRecordError.message);
    }

    return NextResponse.json({
      success: true,
      rowCount: projects.length,
      insertedCount: upsertedData?.length || projects.length,
      changes,
      dataQuality: {
        total_projects: dataQuality.total_projects,
        missing_completion_percent: dataQuality.missing_completion_percent,
        missing_contractor: dataQuality.missing_contractor,
        missing_region: dataQuality.missing_region,
        missing_contract_value: dataQuality.missing_contract_value,
        missing_status: dataQuality.missing_status,
        projects_without_completion: dataQuality.projects_without_completion,
        projects_without_contractor: dataQuality.projects_without_contractor
      },
      mappedColumns: debug.mappedColumns,
      sampleData: debug.sampleData
    });
  } catch (error) {
    console.error('=== PROJECT UPLOAD ERROR ===');
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Failed to process Excel file', details: String(error) },
      { status: 500 }
    );
  }
}
