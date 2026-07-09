import { NextRequest, NextResponse } from 'next/server';
import { requireAirstripAccess } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db-admin';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { AIRSTRIP_STATUSES, SURFACE_CONDITIONS, FLIGHT_FREQUENCIES, currentQuarter, guyanaToday } from '@/lib/airstrip-types';
import { getAirstripSettings, augmentAirstrip, type AirstripOverviewRow } from '@/lib/airstrips/queries';
import { parseBody } from '@/lib/api-utils';

// GET /api/airstrips/[id] — full detail with related data
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAirstripAccess();
    if (authResult instanceof NextResponse) return authResult;

    const { id } = await params;

    // Fetch airstrip overview (derived cadence + responsibility) + related data in parallel
    const [airstripRes, settings, maintenanceRes, photosRes, inspectionsRes, statusLogRes] = await Promise.all([
      supabaseAdmin.from('airstrip_overview').select('*').eq('id', id).single(),
      getAirstripSettings(),
      supabaseAdmin
        .from('airstrip_maintenance_log')
        .select('*, verified_by_user:users!airstrip_maintenance_log_verified_by_fkey(name)')
        .eq('airstrip_id', id)
        .order('performed_date', { ascending: false }),
      supabaseAdmin
        .from('airstrip_photos')
        .select('*')
        .eq('airstrip_id', id)
        .order('uploaded_at', { ascending: false }),
      supabaseAdmin
        .from('airstrip_inspections')
        .select('*')
        .eq('airstrip_id', id)
        .order('inspection_date', { ascending: false }),
      supabaseAdmin
        .from('airstrip_status_log')
        .select('*, changed_by_user:users!airstrip_status_log_changed_by_fkey(name)')
        .eq('airstrip_id', id)
        .order('changed_at', { ascending: false }),
    ]);

    if (airstripRes.error || !airstripRes.data) {
      return NextResponse.json({ error: 'Airstrip not found' }, { status: 404 });
    }

    const airstrip = augmentAirstrip(airstripRes.data as AirstripOverviewRow, settings, guyanaToday());

    // Compute quick stats — current quarter anchored to Guyana local time (UTC-4).
    const quarterStr = currentQuarter();

    const maintenance = maintenanceRes.data || [];
    const quarterMaintenance = maintenance.filter(m => m.quarter === quarterStr);

    return NextResponse.json({
      airstrip,
      maintenance,
      photos: photosRes.data || [],
      inspections: inspectionsRes.data || [],
      statusLog: (statusLogRes.data || []).map((s: Record<string, unknown>) => ({
        ...s,
        changed_by_name: (s.changed_by_user as { name: string } | null)?.name || null,
      })),
      quickStats: {
        currentQuarter: quarterStr,
        maintenanceThisQuarter: quarterMaintenance.length,
        verifiedThisQuarter: quarterMaintenance.filter(m => m.verified).length,
        unverifiedThisQuarter: quarterMaintenance.filter(m => !m.verified).length,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Airstrip detail error');
    return NextResponse.json({ error: 'Failed to fetch airstrip' }, { status: 500 });
  }
}

// ── PATCH /api/airstrips/[id] ────────────────────────────────────────────────
// Update an existing airstrip. If status changed, logs to airstrip_status_log.

const updateSchema = z.object({
  name: z.string().min(1, 'Name is required').trim().optional(),
  region: z.number().int().min(1).max(10).optional(),
  status: z.enum(AIRSTRIP_STATUSES).optional(),
  status_change_reason: z.string().trim().optional(),
  engineered_structure: z.boolean().optional(),
  runway_length_m: z.number().positive().nullable().optional(),
  runway_width_m: z.number().positive().nullable().optional(),
  surface_type: z.string().trim().nullable().optional(),
  surface_condition: z.enum(SURFACE_CONDITIONS).nullable().optional(),
  flight_frequency: z.enum(FLIGHT_FREQUENCIES).nullable().optional(),
  last_inspection_date: z.string().nullable().optional(),
  airside_buildings: z.string().trim().nullable().optional(),
  remarks: z.string().trim().nullable().optional(),
  coordinates_lat: z.number().min(-90).max(90).nullable().optional(),
  coordinates_lon: z.number().min(-180).max(180).nullable().optional(),
  target_maintenance_interval_days: z.number().int().positive().nullable().optional(),
  responsible_manager_id: z.string().uuid().nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAirstripAccess();
    if (authResult instanceof NextResponse) return authResult;
    const { session } = authResult;

    const { id } = await params;
    const { data, error: validationError } = await parseBody(request, updateSchema);
    if (validationError) return validationError;

    const { data: current, error: fetchErr } = await supabaseAdmin
      .from('airstrips')
      .select('status, name')
      .eq('id', id)
      .single();

    if (fetchErr || !current) {
      return NextResponse.json({ error: 'Airstrip not found' }, { status: 404 });
    }

    const statusChanged = !!data.status && data.status !== current.status;

    // Require reason when status changes
    if (statusChanged && !data.status_change_reason?.trim()) {
      return NextResponse.json({ error: 'Reason is required when changing status', field: 'status_change_reason' }, { status: 400 });
    }

    // Check name uniqueness if changed
    if (data.name && data.name.toLowerCase() !== current.name.toLowerCase()) {
      const { data: existing } = await supabaseAdmin
        .from('airstrips')
        .select('id')
        .ilike('name', data.name)
        .neq('id', id)
        .limit(1);

      if (existing && existing.length > 0) {
        return NextResponse.json({ error: 'An airstrip with this name already exists', field: 'name' }, { status: 409 });
      }
    }

    // Split status out: the status change + its log are applied atomically by the
    // airstrip_change_status RPC (eliminates the old parallel update/log desync).
    // Non-status fields are updated normally.
    const { status_change_reason, status, ...otherFields } = data;

    if (Object.keys(otherFields).length > 0) {
      const { error: updateErr } = await supabaseAdmin
        .from('airstrips')
        .update({ ...otherFields, updated_by: session.user.id })
        .eq('id', id);
      if (updateErr) throw updateErr;
    }

    if (statusChanged) {
      const { error: statusErr } = await supabaseAdmin.rpc('airstrip_change_status', {
        p_airstrip_id: id,
        p_new_status: status,
        p_reason: status_change_reason ?? null,
        p_user_id: session.user.id,
      });
      if (statusErr) throw statusErr;
    }

    // Return the refreshed, cadence-augmented airstrip. The overview re-fetch must
    // follow the writes; the settings load does not, so run them together.
    const [{ data: refreshed }, settings] = await Promise.all([
      supabaseAdmin.from('airstrip_overview').select('*').eq('id', id).single(),
      getAirstripSettings(),
    ]);
    const airstrip = refreshed
      ? augmentAirstrip(refreshed as AirstripOverviewRow, settings, guyanaToday())
      : null;

    return NextResponse.json({ airstrip });
  } catch (error) {
    logger.error({ err: error }, 'Update airstrip error');
    return NextResponse.json({ error: 'Failed to update airstrip' }, { status: 500 });
  }
}
