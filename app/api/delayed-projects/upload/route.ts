import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';
import { snapshotBeforeUpload } from '@/lib/delayed-projects/snapshot-engine';
import type { ParsedDelayedProject } from '@/lib/delayed-projects/upload-parser';
import type { UploadResult, DeltaEntry } from '@/lib/delayed-projects/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const authResult = await requireRole(['dg', 'ps']);
  if (authResult instanceof NextResponse) return authResult;

  let body: { rows: ParsedDelayedProject[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { rows } = body;
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
  }

  // 1. Snapshot existing projects before upload
  const { date: snapshotDate } = await snapshotBeforeUpload();

  // 2. Fetch existing project_references for delta detection
  const { data: existingRows } = await supabaseAdmin
    .from('delayed_projects')
    .select('id, project_reference, completion_percent, project_name, sub_agency');

  const existingMap = new Map<string, {
    id: string;
    completion_percent: number;
    project_name: string;
    sub_agency: string;
  }>();
  for (const r of existingRows || []) {
    existingMap.set(r.project_reference, {
      id: r.id,
      completion_percent: Number(r.completion_percent),
      project_name: r.project_name,
      sub_agency: r.sub_agency,
    });
  }

  const uploadRefs = new Set(rows.map((r) => r.project_reference));

  // 3. Upsert rows in batches of 50
  let updated = 0;
  let inserted = 0;
  let unchanged = 0;
  const biggestDeltas: DeltaEntry[] = [];

  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const upsertRows = chunk.map((r) => ({
      project_reference: r.project_reference,
      executing_agency: r.executing_agency,
      sub_agency: r.sub_agency,
      project_name: r.project_name,
      region: r.region,
      tender_board_type: r.tender_board_type,
      contract_value: r.contract_value,
      contractors: r.contractors,
      project_end_date: r.project_end_date,
      completion_percent: r.completion_percent,
      has_images: r.has_images,
      status: r.status || 'DELAYED',
    }));

    const { error } = await supabaseAdmin
      .from('delayed_projects')
      .upsert(upsertRows, { onConflict: 'project_reference' });

    if (error) {
      logger.error({ error, chunk: i }, 'Delayed projects upsert chunk failed');
      // Fallback to one-by-one
      for (const row of upsertRows) {
        const { error: singleErr } = await supabaseAdmin
          .from('delayed_projects')
          .upsert(row, { onConflict: 'project_reference' });
        if (singleErr) {
          logger.error({ error: singleErr, ref: row.project_reference }, 'Single row upsert failed');
        }
      }
    }

    // Track inserts vs updates and compute deltas
    for (const r of chunk) {
      const existing = existingMap.get(r.project_reference);
      if (!existing) {
        inserted++;
      } else {
        const delta = r.completion_percent - existing.completion_percent;
        if (Math.abs(delta) < 0.01) {
          unchanged++;
        } else {
          updated++;
          biggestDeltas.push({
            project_id: existing.id,
            project_name: r.project_name,
            sub_agency: r.sub_agency,
            previous_pct: existing.completion_percent,
            current_pct: r.completion_percent,
            delta,
          });
        }
      }
    }
  }

  // 4. Detect exits (in DB but not in upload)
  const notInUpload = Array.from(existingMap.entries())
    .filter(([ref]) => !uploadRefs.has(ref))
    .map(([ref, data]) => ({
      project_reference: ref,
      project_name: data.project_name,
      sub_agency: data.sub_agency,
    }));

  // Sort biggest deltas by absolute delta descending
  biggestDeltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const result: UploadResult = {
    updated,
    inserted,
    unchanged,
    not_in_upload: notInUpload,
    biggest_deltas: biggestDeltas.slice(0, 10),
    snapshot_date: snapshotDate,
  };

  logger.info(
    { updated, inserted, unchanged, notInUpload: notInUpload.length },
    'Delayed projects upload completed',
  );

  return NextResponse.json(result);
}
