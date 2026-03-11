import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { createHash } from 'crypto';
import { parseGPLBuffer, parseGWIBuffer } from '@/lib/pending-applications-parser';
import { createSnapshot } from '@/lib/pending-applications-snapshots';
import { processUploadDiff } from '@/lib/service-connection-diff';
import type { PendingRecord } from '@/lib/pending-applications-types';
import { classifyTrack } from '@/lib/service-connection-track';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/api-utils';
import { logger } from '@/lib/logger';

export const maxDuration = 300; // 5 minutes for heavy processing

const BUCKET = 'pending-uploads';

/**
 * Validate upload authorization (same logic as upload route).
 */
async function validateAuth(request: NextRequest): Promise<string | null> {
  const session = await auth();
  if (session?.user?.id) {
    const role = session.user.role;
    if (['dg', 'minister', 'ps'].includes(role)) return null;
    if (session.user.agency) return session.user.agency.toUpperCase();
    throw { status: 403, error: 'Your account does not have upload access' };
  }

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

/** Classify track from a PendingRecord using shared classification logic */
function classifyTrackFromRecord(rec: PendingRecord): 'A' | 'B' | 'Design' | 'unknown' {
  const track = classifyTrack(rec.pipeline_stage, rec.service_order_type, []);
  if (track !== 'unknown') return track;
  const rawTrack = rec.raw_data?._track;
  if (rawTrack === 'A' || rawTrack === 'B' || rawTrack === 'Design') return rawTrack as 'A' | 'B' | 'Design';
  return 'unknown';
}

/** Insert completed records directly into service_connections */
async function insertCompletedConnections(records: PendingRecord[], dataAsOf: string) {
  const batchSize = 200;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize).map(rec => {
      const track = classifyTrackFromRecord(rec);
      return {
        customer_reference: rec.customer_reference,
        service_order_number: rec.service_order_number,
        first_name: rec.first_name,
        last_name: rec.last_name,
        telephone: rec.telephone,
        region: rec.region,
        district: rec.district,
        village_ward: rec.village_ward,
        street: rec.street,
        lot: rec.lot,
        account_type: rec.account_type,
        service_order_type: rec.service_order_type,
        division_code: rec.division_code,
        cycle: rec.cycle,
        application_date: rec.application_date || null,
        track,
        status: 'completed',
        current_stage: rec.pipeline_stage,
        stage_history: rec.pipeline_stage
          ? [{ stage: rec.pipeline_stage, entered: rec.application_date || dataAsOf, exited: rec.date_work_completed || dataAsOf, days: rec.days_taken ?? null }]
          : [],
        first_seen_date: dataAsOf,
        last_seen_date: dataAsOf,
        disappeared_date: rec.date_work_completed || dataAsOf,
        energisation_date: rec.date_work_completed || dataAsOf,
        total_days_to_complete: rec.days_taken ?? null,
        is_legacy: false,
        raw_data: rec.raw_data,
      };
    });

    const { error } = await supabaseAdmin
      .from('service_connections')
      .upsert(batch, {
        onConflict: 'customer_reference,service_order_number',
        ignoreDuplicates: false,
      });

    if (error) {
      for (const row of batch) {
        await supabaseAdmin.from('service_connections').insert(row).select('id');
      }
    }
  }
}

/**
 * Phase 2: Download stored file from Supabase Storage, parse Excel,
 * run diff engine, insert records, create snapshot.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  let lockedAgency: string | null;
  try {
    lockedAgency = await validateAuth(request);
  } catch (authError: unknown) {
    const err = authError as { status: number; error: string };
    return NextResponse.json({ error: err.error }, { status: err.status });
  }

  const body = await request.json();
  const { storagePath, agency: agencyParam } = body;

  if (!storagePath || !agencyParam) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  let agency = (lockedAgency || agencyParam).toUpperCase() as 'GPL' | 'GWI';
  if (agency !== 'GPL' && agency !== 'GWI') {
    return NextResponse.json({ error: 'Invalid agency' }, { status: 400 });
  }

  // Download file from Supabase Storage
  const { data: fileData, error: dlError } = await supabaseAdmin.storage
    .from(BUCKET)
    .download(storagePath);

  if (dlError || !fileData) {
    logger.error({ err: dlError, storagePath }, 'Failed to download file from storage');
    return NextResponse.json({ error: 'File not found or expired. Please upload again.' }, { status: 404 });
  }

  const buffer = Buffer.from(await fileData.arrayBuffer());

  // Parse Excel
  const result = agency === 'GPL' ? parseGPLBuffer(buffer) : parseGWIBuffer(buffer);
  if (!result.success || result.records.length === 0) {
    await supabaseAdmin.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    return NextResponse.json({
      error: result.warnings.length > 0 ? result.warnings.join('; ') : 'No records found in file',
      warnings: result.warnings,
    }, { status: 400 });
  }

  // Separate outstanding vs completed records
  const outstandingRecords = result.records.filter(r => !r.is_completed);
  const completedRecords = result.records.filter(r => r.is_completed);

  // Run diff engine for GPL outstanding records
  let diffResult = null;
  if (agency === 'GPL') {
    try {
      diffResult = await processUploadDiff(outstandingRecords, result.dataAsOf);
    } catch (diffErr) {
      logger.error({ err: diffErr, agency }, 'Diff engine error (non-fatal)');
    }

    // Insert completed records into service_connections
    if (completedRecords.length > 0) {
      try {
        await insertCompletedConnections(completedRecords, result.dataAsOf);
      } catch (compErr) {
        logger.error({ err: compErr, agency, count: completedRecords.length }, 'Completed records insert error (non-fatal)');
      }
    }
  }

  // Full-refresh upsert of outstanding records into pending_applications
  const { error: deleteError } = await supabaseAdmin
    .from('pending_applications')
    .delete()
    .eq('agency', agency);

  if (deleteError) {
    await supabaseAdmin.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    return NextResponse.json({ error: 'Failed to clear existing records' }, { status: 500 });
  }

  // Strip completed-only fields before inserting
  const pendingBatch = outstandingRecords.map(r => {
    const { is_completed, date_work_completed, days_taken, ...rest } = r;
    return rest;
  });

  // Insert in batches (larger batches = fewer round trips)
  let insertedCount = 0;
  const batchSize = 500;
  for (let i = 0; i < pendingBatch.length; i += batchSize) {
    const batch = pendingBatch.slice(i, i + batchSize);
    const { data, error: insertError } = await supabaseAdmin
      .from('pending_applications')
      .insert(batch)
      .select('id');

    if (insertError) {
      logger.error({ err: insertError, agency, batchOffset: i }, 'Pending applications insert error');
    } else {
      insertedCount += data?.length || 0;
    }
  }

  // Create snapshot (outstanding only)
  await createSnapshot(agency, outstandingRecords, result.dataAsOf);

  // Clean up stored file
  await supabaseAdmin.storage.from(BUCKET).remove([storagePath]).catch(() => {});

  // Build summary breakdown
  const breakdown: Record<string, number> = {};
  for (const r of result.records) {
    if (agency === 'GPL') {
      const prefix = r.is_completed ? 'Completed ' : 'Outstanding ';
      const track = (r.raw_data as Record<string, unknown>)?._track || r.pipeline_stage || 'Unknown';
      const label = prefix + track;
      breakdown[label] = (breakdown[label] || 0) + 1;
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
    ...(diffResult && {
      diffResult: {
        disappeared: diffResult.disappeared,
        newOrders: diffResult.newOrders,
        updated: diffResult.updated,
        stillOpen: diffResult.stillOpen,
        legacyExcluded: diffResult.legacyExcluded,
      },
    }),
  });
});
