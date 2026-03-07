import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { parseProjectsExcelWithDebug, ProjectRow, FundingRow } from '@/lib/excel-parser';
import { detectChanges } from '@/lib/change-detector';
import { requireRole } from '@/lib/auth-helpers';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// ── JSON upload (scraped data from oversight.gov.gy) ──────────────────────

interface ScrapedProject {
  project_id: string;
  executing_agency?: string;
  sub_agency?: string;
  project_name: string;
  region?: string;
  tender_board_type?: string;
  contract_value?: number;
  contractor?: string;
  project_end_date?: string;
  completion_pct?: number;
  has_images?: number;
  // Detail fields
  balance_remaining?: number;
  remarks?: string;
  project_status?: string;
  extension_reason?: string;
  extension_date?: string;
  project_extended?: boolean;
  // Funding (compact format from scraper)
  total_distributed?: number;
  total_expended?: number;
  funding_data?: string; // JSON string: [{d, t, a, e}]
}

async function handleJsonUpload(body: { projects: ScrapedProject[] }) {
  if (!body.projects?.length) {
    return NextResponse.json({ error: 'No projects in payload' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const projects: ProjectRow[] = body.projects.map(p => ({
    project_id: p.project_id,
    executing_agency: p.executing_agency || null,
    sub_agency: p.sub_agency || null,
    project_name: p.project_name,
    region: p.region || null,
    tender_board_type: p.tender_board_type || null,
    contract_value: p.contract_value ?? null,
    contractor: p.contractor || null,
    project_end_date: p.project_end_date || null,
    completion_pct: p.completion_pct ?? 0,
    has_images: p.has_images ?? 0,
    balance_remaining: p.balance_remaining ?? null,
    remarks: p.remarks || null,
    project_status: p.project_status || null,
    extension_reason: p.extension_reason || null,
    extension_date: p.extension_date || null,
    project_extended: p.project_extended ?? false,
  }));

  // Detect changes
  let changes = null;
  try {
    changes = await detectChanges(projects);
  } catch {
    // First upload
  }

  // Upsert projects with all detail fields
  const { error: upsertError } = await supabaseAdmin
    .from('projects')
    .upsert(
      projects.map(p => ({ ...p, updated_at: now })),
      { onConflict: 'project_id', ignoreDuplicates: false }
    );

  if (upsertError) {
    console.error('JSON upsert error:', upsertError);
    return NextResponse.json({ error: 'Database error while saving projects' }, { status: 500 });
  }

  // Parse and insert funding distributions
  const fundingRows: FundingRow[] = [];
  const projectIdsWithFunding: string[] = [];

  for (const p of body.projects) {
    if (!p.funding_data) continue;
    let rows: { d?: string; t?: string; a?: number; e?: number; b?: number; r?: string; c?: string }[];
    try {
      rows = typeof p.funding_data === 'string' ? JSON.parse(p.funding_data) : p.funding_data;
    } catch {
      continue;
    }
    if (!Array.isArray(rows) || rows.length === 0) continue;

    projectIdsWithFunding.push(p.project_id);
    for (const r of rows) {
      fundingRows.push({
        project_id: p.project_id,
        date_distributed: r.d || null,
        payment_type: r.t || null,
        amount_distributed: r.a ?? null,
        amount_expended: r.e ?? null,
        distributed_balance: r.b ?? null,
        funding_remarks: r.r || null,
        contract_ref: r.c || null,
      });
    }
  }

  if (fundingRows.length > 0) {
    // Delete old funding rows for these projects, then insert fresh
    await supabaseAdmin
      .from('funding_distributions')
      .delete()
      .in('project_id', projectIdsWithFunding);

    // Insert in chunks of 500
    for (let i = 0; i < fundingRows.length; i += 500) {
      const chunk = fundingRows.slice(i, i + 500);
      const { error: fundingError } = await supabaseAdmin
        .from('funding_distributions')
        .insert(chunk);
      if (fundingError) {
        console.error('Funding insert error:', fundingError);
      }
    }
  }

  // Record upload
  await supabaseAdmin.from('project_uploads').insert({
    filename: 'oversight-scraper-json',
    project_count: projects.length,
  });

  return NextResponse.json({
    success: true,
    project_count: projects.length,
    funding_rows: fundingRows.length,
    changes,
  });
}

// ── Excel upload (legacy) ─────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const result = await requireRole(['dg', 'agency_admin']);
  if (result instanceof NextResponse) return result;

  try {
    const contentType = request.headers.get('content-type') || '';

    // JSON upload path (scraper data)
    if (contentType.includes('application/json')) {
      const body = await request.json();
      return handleJsonUpload(body);
    }

    // Excel upload path (legacy)
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
      { error: 'Failed to process upload' },
      { status: 500 }
    );
  }
}
