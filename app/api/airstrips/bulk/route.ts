import { NextRequest, NextResponse } from 'next/server';
import { requireAirstripAccess } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';
import { AIRSTRIP_STATUSES, SURFACE_CONDITIONS, FLIGHT_FREQUENCIES } from '@/lib/airstrip-types';
import { z } from 'zod';
import { parseBody, apiError } from '@/lib/api-utils';

// ── POST /api/airstrips/bulk ─────────────────────────────────────────────────
// Upsert airstrips from a bulk upload. Matches on name (UNIQUE constraint).

const rowSchema = z.object({
  name: z.string().min(1).trim(),
  region: z.number().int().min(1).max(10),
  engineered_structure: z.boolean(),
  runway_length_m: z.number().positive().nullable(),
  runway_width_m: z.number().positive().nullable(),
  surface_type: z.string().trim().nullable(),
  surface_condition: z.enum(SURFACE_CONDITIONS).nullable(),
  last_inspection_date: z.string().nullable(),
  flight_frequency: z.enum(FLIGHT_FREQUENCIES).nullable(),
  airside_buildings: z.string().trim().nullable(),
  remarks: z.string().trim().nullable(),
});

const bodySchema = z.object({
  rows: z.array(rowSchema).min(1, 'At least one valid row is required'),
});

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAirstripAccess();
    if (authResult instanceof NextResponse) return authResult;
    const { session } = authResult;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { rows } = parsed.data;

    // Snapshot existing strips (id + name) to partition insert vs update and to
    // target updates by id. Re-uploading the tracker must NOT reset operational
    // status or rewrite the original creator on existing strips — `status` and
    // `created_by` are therefore written on INSERT only, never on UPDATE. Only the
    // descriptive tracker fields are refreshed for strips that already exist.
    const { data: existingAirstrips, error: snapshotErr } = await supabaseAdmin
      .from('airstrips')
      .select('id, name');

    if (snapshotErr) {
      logger.error({ err: snapshotErr }, 'Airstrip bulk: snapshot fetch failed');
      return NextResponse.json({ error: 'Bulk upsert failed' }, { status: 500 });
    }

    const existingIdByName = new Map(
      (existingAirstrips ?? []).map(a => [a.name.trim().toLowerCase(), a.id as string]),
    );

    // Descriptive fields sourced from the tracker — shared by insert and update.
    const descriptiveFields = (row: (typeof rows)[number]) => ({
      name: row.name.trim(),
      region: row.region,
      engineered_structure: row.engineered_structure,
      runway_length_m: row.runway_length_m,
      runway_width_m: row.runway_width_m,
      surface_type: row.surface_type,
      surface_condition: row.surface_condition,
      last_inspection_date: row.last_inspection_date,
      flight_frequency: row.flight_frequency,
      airside_buildings: row.airside_buildings,
      remarks: row.remarks,
    });

    const toInsert: Record<string, unknown>[] = [];
    const toUpdate: { id: string; fields: Record<string, unknown> }[] = [];
    for (const row of rows) {
      const existingId = existingIdByName.get(row.name.trim().toLowerCase());
      if (existingId) {
        toUpdate.push({ id: existingId, fields: { ...descriptiveFields(row), updated_by: session.user.id } });
      } else {
        toInsert.push({
          ...descriptiveFields(row),
          status: 'operational',
          created_by: session.user.id,
          updated_by: session.user.id,
        });
      }
    }

    // Insert new strips in one statement; update existing strips by id with
    // descriptive fields only (status & created_by deliberately untouched).
    if (toInsert.length > 0) {
      const { error: insertErr } = await supabaseAdmin.from('airstrips').insert(toInsert);
      if (insertErr) {
        logger.error({ err: insertErr }, 'Airstrip bulk insert failed');
        return NextResponse.json({ error: 'Bulk upsert failed' }, { status: 500 });
      }
    }

    if (toUpdate.length > 0) {
      const updateResults = await Promise.all(
        toUpdate.map(u => supabaseAdmin.from('airstrips').update(u.fields).eq('id', u.id)),
      );
      const updErr = updateResults.find(r => r.error)?.error;
      if (updErr) {
        logger.error({ err: updErr }, 'Airstrip bulk update failed');
        return NextResponse.json({ error: 'Bulk upsert failed' }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      inserted: toInsert.length,
      updated: toUpdate.length,
      skipped: 0,
      total: rows.length,
    });
  } catch (error) {
    logger.error({ err: error }, 'Airstrip bulk upload error');
    return NextResponse.json({ error: 'Bulk upload failed' }, { status: 500 });
  }
}

// ── PATCH /api/airstrips/bulk ────────────────────────────────────────────────
// Bulk update status, surface_condition, or flight_frequency for selected airstrips.
// Status changes require a reason and are logged to airstrip_status_log.

const bulkUpdateSchema = z.object({
  airstripIds: z.array(z.string().min(1)).min(1).max(100),
  updates: z.object({
    status: z.enum(AIRSTRIP_STATUSES).optional(),
    surface_condition: z.enum(SURFACE_CONDITIONS).nullable().optional(),
    flight_frequency: z.enum(FLIGHT_FREQUENCIES).nullable().optional(),
  }),
  reason: z.string().trim().optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    const authResult = await requireAirstripAccess();
    if (authResult instanceof NextResponse) return authResult;
    const { session } = authResult;

    const { data, error: validationError } = await parseBody(request, bulkUpdateSchema);
    if (validationError) return validationError;

    const { airstripIds, updates, reason } = data;
    const statusChanged = updates.status !== undefined;

    // Require reason for status changes
    if (statusChanged && !reason?.trim()) {
      return apiError('VALIDATION_ERROR', 'Reason is required when changing status', 400);
    }

    // Non-status fields → one bulk update.
    const fieldUpdates: Record<string, unknown> = { updated_by: session.user.id };
    if (updates.surface_condition !== undefined) fieldUpdates.surface_condition = updates.surface_condition;
    if (updates.flight_frequency !== undefined) fieldUpdates.flight_frequency = updates.flight_frequency;

    if (Object.keys(fieldUpdates).length > 1) {
      const { error: updErr } = await supabaseAdmin
        .from('airstrips')
        .update(fieldUpdates)
        .in('id', airstripIds);
      if (updErr) {
        logger.error({ err: updErr }, 'Airstrip bulk update failed');
        return apiError('DB_ERROR', 'Bulk update failed', 500);
      }
    }

    // Status change → atomic per-airstrip RPC (UPDATE + status_log INSERT in one
    // transaction, logging only when the status actually changes). Replaces the
    // parallel update/log writes that could desync (B9).
    if (statusChanged && updates.status) {
      const results = await Promise.all(
        airstripIds.map(aid =>
          supabaseAdmin.rpc('airstrip_change_status', {
            p_airstrip_id: aid,
            p_new_status: updates.status,
            p_reason: reason?.trim() ?? null,
            p_user_id: session.user.id,
          }),
        ),
      );
      const failed = results.find(r => r.error)?.error;
      if (failed) {
        logger.error({ err: failed }, 'Airstrip bulk status change failed');
        return apiError('DB_ERROR', 'Bulk status change failed', 500);
      }
    }

    return NextResponse.json({
      success: true,
      updated: airstripIds.length,
    });
  } catch (error) {
    logger.error({ err: error }, 'Airstrip bulk update error');
    return apiError('INTERNAL_ERROR', 'Bulk update failed', 500);
  }
}
