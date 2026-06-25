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

    // If status is changing, fetch current statuses for the log
    let currentStatuses: Record<string, string> = {};
    if (statusChanged) {
      const { data: current, error: fetchErr } = await supabaseAdmin
        .from('airstrips')
        .select('id, status')
        .in('id', airstripIds);

      if (fetchErr) {
        logger.error({ err: fetchErr }, 'Bulk update: failed to fetch current statuses');
        return apiError('DB_ERROR', 'Failed to fetch current airstrip data', 500);
      }

      currentStatuses = Object.fromEntries(
        (current ?? []).map(a => [a.id, a.status]),
      );
    }

    // Build update payload
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      updated_by: session.user.id,
    };

    if (updates.status !== undefined) updatePayload.status = updates.status;
    if (updates.surface_condition !== undefined) updatePayload.surface_condition = updates.surface_condition;
    if (updates.flight_frequency !== undefined) updatePayload.flight_frequency = updates.flight_frequency;

    // Build status log rows before updating (need previous_status)
    let logRows: { airstrip_id: string; previous_status: string; new_status: string; changed_by: string; reason: string | null }[] = [];
    if (statusChanged && updates.status) {
      logRows = airstripIds
        .filter(id => currentStatuses[id] && currentStatuses[id] !== updates.status)
        .map(id => ({
          airstrip_id: id,
          previous_status: currentStatuses[id],
          new_status: updates.status!,
          changed_by: session.user.id,
          reason: reason?.trim() || null,
        }));
    }

    // Run update + status log insert in parallel
    const updatePromise = supabaseAdmin
      .from('airstrips')
      .update(updatePayload)
      .in('id', airstripIds);

    const logPromise = logRows.length > 0
      ? supabaseAdmin.from('airstrip_status_log').insert(logRows)
      : Promise.resolve(null);

    const [updateResult, logResult] = await Promise.all([updatePromise, logPromise]);

    if (updateResult.error) {
      logger.error({ err: updateResult.error }, 'Airstrip bulk update failed');
      return apiError('DB_ERROR', 'Bulk update failed', 500);
    }

    if (logResult && 'error' in logResult && logResult.error) {
      logger.error({ err: logResult.error }, 'Airstrip bulk status log insert failed');
      // Non-fatal: update succeeded, log failed
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
