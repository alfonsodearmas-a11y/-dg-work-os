import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { detectAgency, parseGPLBuffer, parseGWIBuffer } from '@/lib/pending-applications-parser';
import { createSnapshot } from '@/lib/pending-applications-snapshots';

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/**
 * Validate upload authorization. Returns the locked agency (for upload-auth)
 * or null (for DG access, meaning any agency is allowed).
 * Throws an object with { status, error } if unauthorized.
 */
function validateAuth(request: NextRequest): string | null {
  // DG is always authorized (middleware already validates dg-auth cookie)
  const dgAuth = request.cookies.get('dg-auth')?.value;
  if (dgAuth) return null; // no agency lock

  // Check upload-auth cookie for agency staff
  const uploadAuth = request.cookies.get('upload-auth')?.value;
  const uploadAgency = request.cookies.get('upload-agency')?.value;

  if (!uploadAuth || !uploadAgency) {
    throw { status: 401, error: 'Authentication required' };
  }

  const agency = uploadAgency.toUpperCase();
  if (agency !== 'GPL' && agency !== 'GWI') {
    throw { status: 401, error: 'Invalid agency' };
  }

  const code = process.env[`UPLOAD_ACCESS_CODE_${agency}`];
  if (!code) {
    throw { status: 401, error: 'Upload access not configured' };
  }

  const expected = createHash('sha256').update(code + '_upload_' + agency).digest('hex');
  if (uploadAuth !== expected) {
    throw { status: 401, error: 'Invalid or expired session' };
  }

  return agency;
}

export async function POST(request: NextRequest) {
  try {
    // Auth check
    let lockedAgency: string | null;
    try {
      lockedAgency = validateAuth(request);
    } catch (authError: unknown) {
      const err = authError as { status: number; error: string };
      return NextResponse.json({ error: err.error }, { status: err.status });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    let agencyHint = formData.get('agency') as string | null;

    // If agency staff, force their agency
    if (lockedAgency) {
      agencyHint = lockedAgency;
    }

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    const name = file.name.toLowerCase();
    if (!name.endsWith('.xls') && !name.endsWith('.xlsx')) {
      return NextResponse.json({ error: 'Invalid file type. Only .xls and .xlsx files are accepted.' }, { status: 400 });
    }

    // Validate size
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum size is 10MB.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Auto-detect or use hint
    let agency = agencyHint?.toUpperCase() as 'GPL' | 'GWI' | undefined;
    if (!agency || (agency !== 'GPL' && agency !== 'GWI')) {
      const detected = detectAgency(buffer);
      if (!detected) {
        return NextResponse.json({ error: 'Could not auto-detect agency. Please specify GPL or GWI.' }, { status: 400 });
      }
      agency = detected;
    }

    // Parse
    const result = agency === 'GPL' ? parseGPLBuffer(buffer) : parseGWIBuffer(buffer);
    if (!result.success || result.records.length === 0) {
      return NextResponse.json({
        error: result.warnings.length > 0 ? result.warnings.join('; ') : 'No records found in file',
        warnings: result.warnings,
      }, { status: 400 });
    }

    // Full-refresh upsert: delete existing records for this agency, then insert
    const supabase = getSupabase();

    const { error: deleteError } = await supabase
      .from('pending_applications')
      .delete()
      .eq('agency', agency);

    if (deleteError) {
      return NextResponse.json({ error: `Failed to clear existing records: ${deleteError.message}` }, { status: 500 });
    }

    // Insert in batches
    let insertedCount = 0;
    const batchSize = 100;
    for (let i = 0; i < result.records.length; i += batchSize) {
      const batch = result.records.slice(i, i + batchSize);
      const { data, error: insertError } = await supabase
        .from('pending_applications')
        .insert(batch)
        .select('id');

      if (insertError) {
        console.error(`[upload] Insert error at batch ${i}:`, insertError.message);
      } else {
        insertedCount += data?.length || 0;
      }
    }

    // Create snapshot
    await createSnapshot(agency, result.records, result.dataAsOf);

    // Build summary breakdown
    const breakdown: Record<string, number> = {};
    for (const r of result.records) {
      if (agency === 'GPL') {
        const stage = r.pipeline_stage || 'Unknown';
        breakdown[stage] = (breakdown[stage] || 0) + 1;
      } else {
        const region = r.region || 'Unknown';
        breakdown[region] = (breakdown[region] || 0) + 1;
      }
    }

    return NextResponse.json({
      success: true,
      agency,
      recordCount: insertedCount,
      dataAsOf: result.dataAsOf,
      sheetName: result.sheetName,
      breakdown,
      warnings: result.warnings,
    });
  } catch (err) {
    console.error('[pending-applications/upload] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
