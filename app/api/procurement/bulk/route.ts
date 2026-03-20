import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { ProcurementStage, ProcurementMethod } from '@/lib/procurement-types';
import { METHOD_CONFIG, PROCUREMENT_STAGES } from '@/lib/procurement-types';

// ── POST: Bulk import packages ───────────────────────────────────────────────

interface BulkRow {
  title: string;
  description?: string | null;
  bid_reference?: string | null;
  estimated_value?: number | null;
  procurement_method?: string | null;
  opening_date?: string | null;
  tender_board?: string | null;
  expected_delivery_date?: string | null;
  notes?: string | null;
  current_stage: string;
}

export async function POST(request: NextRequest) {
  const result = await requireRole(['dg', 'agency_admin']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const body = await request.json();
  const { agency, fileName, rows, defaultStage } = body as {
    agency: string;
    fileName: string;
    rows: BulkRow[];
    defaultStage: ProcurementStage;
  };

  if (!agency || !fileName || !Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Agency access check
  if (session.user.role !== 'dg' && session.user.agency?.toUpperCase() !== agency.toUpperCase()) {
    return NextResponse.json({ error: 'Cannot import to another agency' }, { status: 403 });
  }

  // 1. Create import batch record
  const { data: batch, error: batchError } = await supabaseAdmin
    .from('procurement_import_batches')
    .insert({
      agency,
      uploaded_by: session.user.id,
      file_name: fileName,
      row_count: rows.length,
      status: 'completed',
    })
    .select('id')
    .single();

  if (batchError) {
    logger.error({ err: batchError, agency, fileName }, 'Import batch insert failed');
    return NextResponse.json({ error: 'Failed to create import batch' }, { status: 500 });
  }

  // 2. Filter out cancelled rows (not a valid DB stage) and prepare inserts
  const insertableRows = rows.filter((r) =>
    r.current_stage !== 'cancelled'
  );
  const skippedCancelled = rows.length - insertableRows.length;

  // Track per-row: original index → { packageId, stage, notes }
  const importedMap = new Map<number, { id: string; stage: string; notes: string | null }>();
  const failed: { index: number; title: string; error: string }[] = [];
  const BATCH_SIZE = 50;

  for (let i = 0; i < insertableRows.length; i += BATCH_SIZE) {
    const chunk = insertableRows.slice(i, i + BATCH_SIZE);
    const insertRows = chunk.map((row) => {
      const stage = PROCUREMENT_STAGES.includes(row.current_stage as ProcurementStage)
        ? row.current_stage
        : defaultStage;
      const method = row.procurement_method && (row.procurement_method in METHOD_CONFIG)
        ? row.procurement_method
        : 'open_tender';

      return {
        agency,
        title: row.title,
        description: row.description || null,
        estimated_value: row.estimated_value ?? 0,
        procurement_method: method,
        current_stage: stage,
        submitted_by: session.user.id,
        bid_reference: row.bid_reference || null,
        opening_date: row.opening_date || null,
        tender_board: row.tender_board || null,
        expected_delivery_date: row.expected_delivery_date || null,
        import_batch_id: batch.id,
      };
    });

    const { data: insertedData, error: insertError } = await supabaseAdmin
      .from('procurement_packages')
      .insert(insertRows)
      .select('id, title');

    if (insertError) {
      logger.error({ err: insertError, batchId: batch.id, chunkOffset: i }, 'Bulk package insert failed (batch)');
      // If batch insert fails, try one-by-one to identify specific failures
      for (let j = 0; j < insertRows.length; j++) {
        const { data: single, error: singleError } = await supabaseAdmin
          .from('procurement_packages')
          .insert(insertRows[j])
          .select('id, title');

        if (singleError) {
          failed.push({ index: i + j, title: chunk[j].title, error: singleError.message });
        } else if (single?.[0]) {
          const origIdx = i + j;
          importedMap.set(origIdx, {
            id: single[0].id as string,
            stage: insertRows[j].current_stage,
            notes: chunk[j].notes ?? null,
          });
        }
      }
    } else if (insertedData) {
      for (let j = 0; j < insertedData.length; j++) {
        const origIdx = i + j;
        importedMap.set(origIdx, {
          id: insertedData[j].id as string,
          stage: insertRows[j].current_stage,
          notes: chunk[j].notes ?? null,
        });
      }
    }
  }

  // 3. Insert stage history with correct per-row stage
  const historyRows = Array.from(importedMap.values()).map((entry) => ({
    package_id: entry.id,
    from_stage: null,
    to_stage: entry.stage,
    changed_by: session.user.id,
    notes: `Bulk import: ${fileName}`,
  }));

  // 4. Insert notes for rows that had notes
  const notesToInsert = Array.from(importedMap.values())
    .filter((entry) => entry.notes)
    .map((entry) => ({
      package_id: entry.id,
      content: entry.notes!,
      created_by: session.user.id,
    }));

  // Run history and notes inserts in parallel
  const batchInsert = async (table: string, allRows: Record<string, unknown>[]) => {
    for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
      await supabaseAdmin.from(table).insert(allRows.slice(i, i + BATCH_SIZE));
    }
  };

  await Promise.all([
    historyRows.length > 0 ? batchInsert('procurement_stage_history', historyRows) : Promise.resolve(),
    notesToInsert.length > 0 ? batchInsert('procurement_notes', notesToInsert) : Promise.resolve(),
  ]);

  const importedCount = importedMap.size;

  // Update batch row count if some failed
  if (failed.length > 0 || skippedCancelled > 0) {
    await supabaseAdmin
      .from('procurement_import_batches')
      .update({ row_count: importedCount })
      .eq('id', batch.id);
  }

  return NextResponse.json({
    batchId: batch.id,
    imported: importedCount,
    skippedCancelled,
    failed,
    total: rows.length,
  }, { status: 201 });
}

// ── GET: Recent import batches ───────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const result = await requireRole(['dg', 'agency_admin']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  let query = supabaseAdmin
    .from('procurement_import_batches')
    .select('id, agency, uploaded_by, file_name, row_count, status, created_at, uploader:users!procurement_import_batches_uploaded_by_fkey(name)')
    .order('created_at', { ascending: false })
    .limit(5);

  if (session.user.role !== 'dg') {
    query = query.eq('agency', session.user.agency);
  }

  const { data, error } = await query;
  if (error) {
    logger.error({ err: error }, 'Failed to fetch import batches');
    return NextResponse.json({ error: 'Failed to fetch import batches' }, { status: 500 });
  }

  const batches = (data || []).map((b: Record<string, unknown>) => ({
    id: b.id,
    agency: b.agency,
    file_name: b.file_name,
    row_count: b.row_count,
    status: b.status,
    created_at: b.created_at,
    uploaded_by_name: ((Array.isArray(b.uploader) ? b.uploader[0] : b.uploader) as { name: string } | null)?.name || 'Unknown',
  }));

  return NextResponse.json({ batches });
}

// ── DELETE: Rollback an import batch ─────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  const result = await requireRole(['dg', 'agency_admin']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const { batchId } = await request.json();
  if (!batchId) {
    return NextResponse.json({ error: 'Missing batchId' }, { status: 400 });
  }

  // Verify batch exists and user has access
  const { data: batch, error: fetchError } = await supabaseAdmin
    .from('procurement_import_batches')
    .select('id, agency, status')
    .eq('id', batchId)
    .single();

  if (fetchError || !batch) {
    return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
  }

  if (session.user.role !== 'dg' && session.user.agency?.toUpperCase() !== (batch.agency as string).toUpperCase()) {
    return NextResponse.json({ error: 'Cannot rollback another agency\'s import' }, { status: 403 });
  }

  if (batch.status === 'rolled_back') {
    return NextResponse.json({ error: 'Batch already rolled back' }, { status: 400 });
  }

  // Delete all packages from this batch (cascades to stage_history, notes, documents)
  const { error: deleteError, count } = await supabaseAdmin
    .from('procurement_packages')
    .delete({ count: 'exact' })
    .eq('import_batch_id', batchId);

  if (deleteError) {
    return NextResponse.json({ error: 'Failed to delete tenders' }, { status: 500 });
  }

  // Mark batch as rolled back
  await supabaseAdmin
    .from('procurement_import_batches')
    .update({ status: 'rolled_back' })
    .eq('id', batchId);

  return NextResponse.json({ removed: count ?? 0, batchId });
}
