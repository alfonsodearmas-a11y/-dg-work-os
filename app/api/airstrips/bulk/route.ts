import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';
import { SURFACE_CONDITIONS, FLIGHT_FREQUENCIES } from '@/lib/airstrip-types';
import { z } from 'zod';

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
    const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin']);
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

    // Snapshot existing names for insert-vs-update counting
    const { data: existingAirstrips } = await supabaseAdmin
      .from('airstrips')
      .select('name');

    const existingNames = new Set(
      (existingAirstrips ?? []).map(a => a.name.toLowerCase()),
    );

    // Count how many are inserts vs updates before upserting
    let inserted = 0;
    let updated = 0;
    for (const row of rows) {
      if (existingNames.has(row.name.trim().toLowerCase())) {
        updated++;
      } else {
        inserted++;
      }
    }

    // Build upsert payload
    const upsertRows = rows.map(row => ({
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
      status: 'operational',
      updated_by: session.user.id,
      created_by: session.user.id,
    }));

    // Single upsert — ON CONFLICT (name) DO UPDATE
    const { error } = await supabaseAdmin
      .from('airstrips')
      .upsert(upsertRows, { onConflict: 'name' });

    if (error) {
      logger.error({ err: error }, 'Airstrip bulk upsert failed');
      return NextResponse.json({ error: 'Bulk upsert failed' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      inserted,
      updated,
      skipped: 0,
      total: rows.length,
    });
  } catch (error) {
    logger.error({ err: error }, 'Airstrip bulk upload error');
    return NextResponse.json({ error: 'Bulk upload failed' }, { status: 500 });
  }
}
