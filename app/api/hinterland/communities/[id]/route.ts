import { NextRequest, NextResponse } from 'next/server';
import { requireHinterlandAccess } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { parseBody } from '@/lib/api-utils';
import { WATER_STATUSES } from '@/lib/hinterland-types';
import type { CommunityDetail, LinkedAirstrip, WaterStatusLogEntry } from '@/lib/hinterland-types';

// ── GET /api/hinterland/communities/[id] ──────────────────────────────────────
// One community with water_status, water_sources, water_status_log,
// electricity_status, and a READ-ONLY snapshot of the linked airstrip (from the
// airstrips module — system of record — never copied).

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireHinterlandAccess();
    if (authResult instanceof NextResponse) return authResult;

    const { id } = await params;

    const [communityRes, waterStatusRes, waterSourcesRes, waterLogRes, electricityRes] = await Promise.all([
      supabaseAdmin.from('communities').select('*').eq('id', id).single(),
      supabaseAdmin.from('water_status').select('*').eq('community_id', id).maybeSingle(),
      supabaseAdmin.from('water_sources').select('*').eq('community_id', id).order('source_name', { ascending: true }),
      supabaseAdmin
        .from('water_status_log')
        .select('*, changed_by_user:users!water_status_log_changed_by_fkey(name)')
        .eq('community_id', id)
        .order('changed_at', { ascending: false }),
      supabaseAdmin.from('electricity_status').select('*').eq('community_id', id).maybeSingle(),
    ]);

    if (communityRes.error || !communityRes.data) {
      return NextResponse.json({ error: 'Community not found' }, { status: 404 });
    }
    const community = communityRes.data;

    // Linked airstrip snapshot — read from the airstrips tables, plus the date of
    // its most recent status change from airstrip_status_log.
    let airstrip: LinkedAirstrip | null = null;
    if (community.nearest_airstrip_id) {
      const [airstripRes, airstripLogRes] = await Promise.all([
        supabaseAdmin
          .from('airstrips')
          .select('id, name, region, status, surface_condition, last_inspection_date')
          .eq('id', community.nearest_airstrip_id)
          .maybeSingle(),
        supabaseAdmin
          .from('airstrip_status_log')
          .select('changed_at')
          .eq('airstrip_id', community.nearest_airstrip_id)
          .order('changed_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (airstripRes.data) {
        airstrip = {
          ...airstripRes.data,
          last_status_changed_at: airstripLogRes.data?.changed_at ?? null,
        } as LinkedAirstrip;
      }
    }

    const water_status_log = (waterLogRes.data ?? []).map((s: Record<string, unknown>) => ({
      ...s,
      changed_by_name: (s.changed_by_user as { name: string } | null)?.name ?? null,
    })) as WaterStatusLogEntry[];

    const detail: CommunityDetail = {
      community,
      water_status: waterStatusRes.data ?? null,
      water_sources: waterSourcesRes.data ?? [],
      water_status_log,
      electricity_status: electricityRes.data ?? null,
      airstrip,
    };

    return NextResponse.json(detail);
  } catch (error) {
    logger.error({ err: error }, 'Hinterland community detail error');
    return NextResponse.json({ error: 'Failed to fetch community' }, { status: 500 });
  }
}

// ── PATCH /api/hinterland/communities/[id] ────────────────────────────────────
// Edit community fields (incl. nearest_airstrip_id) and/or the water record.
// On a water status change, append a water_status_log row.

const updateSchema = z.object({
  // Community fields
  sub_district: z.string().trim().nullable().optional(),
  community_type: z.string().trim().nullable().optional(),
  population: z.number().int().nonnegative().nullable().optional(),
  population_source: z.string().trim().nullable().optional(),
  remarks: z.string().trim().nullable().optional(),
  nearest_airstrip_id: z.string().uuid().nullable().optional(),
  // Water record fields (prefixed to avoid the `remarks` collision)
  water_status: z.enum(WATER_STATUSES).optional(),
  water_status_reason: z.string().trim().optional(),
  water_coverage_percent: z.number().min(0).max(100).nullable().optional(),
  water_existing_infrastructure: z.string().trim().nullable().optional(),
  water_proposed_solutions: z.string().trim().nullable().optional(),
  water_remarks: z.string().trim().nullable().optional(),
  water_action: z.string().trim().nullable().optional(),
  water_schools_access: z.string().trim().nullable().optional(),
});

const COMMUNITY_KEYS = ['sub_district', 'community_type', 'population', 'population_source', 'remarks', 'nearest_airstrip_id'] as const;

const WATER_FIELD_MAP: Record<string, string> = {
  water_coverage_percent: 'coverage_percent',
  water_existing_infrastructure: 'existing_infrastructure',
  water_proposed_solutions: 'proposed_solutions',
  water_remarks: 'remarks',
  water_action: 'action',
  water_schools_access: 'schools_access',
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireHinterlandAccess();
    if (authResult instanceof NextResponse) return authResult;
    const { session } = authResult;

    const { id } = await params;
    const { data, error: validationError } = await parseBody(request, updateSchema);
    if (validationError) return validationError;

    // Confirm the community exists and load the current water status for logging.
    const [communityRes, waterRes] = await Promise.all([
      supabaseAdmin.from('communities').select('id').eq('id', id).single(),
      supabaseAdmin.from('water_status').select('status').eq('community_id', id).maybeSingle(),
    ]);
    if (communityRes.error || !communityRes.data) {
      return NextResponse.json({ error: 'Community not found' }, { status: 404 });
    }

    // 1. Community fields
    const communityUpdate: Record<string, unknown> = {};
    for (const key of COMMUNITY_KEYS) {
      if (key in data) communityUpdate[key] = data[key];
    }
    if (Object.keys(communityUpdate).length > 0) {
      const { error } = await supabaseAdmin
        .from('communities')
        .update({ ...communityUpdate, updated_by: session.user.id, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    }

    // 2. Water record fields (upsert on community_id — 1:1)
    const waterUpdate: Record<string, unknown> = {};
    for (const [payloadKey, column] of Object.entries(WATER_FIELD_MAP)) {
      if (payloadKey in data) waterUpdate[column] = data[payloadKey as keyof typeof data];
    }
    const statusChanged = !!data.water_status && data.water_status !== (waterRes.data?.status ?? null);
    if (statusChanged) waterUpdate.status = data.water_status;

    if (Object.keys(waterUpdate).length > 0) {
      const { error } = await supabaseAdmin
        .from('water_status')
        .upsert(
          { community_id: id, ...waterUpdate, updated_by: session.user.id, updated_at: new Date().toISOString() },
          { onConflict: 'community_id' },
        );
      if (error) throw error;
    }

    // 3. Log the status change (append-only history)
    if (statusChanged) {
      const { error } = await supabaseAdmin.from('water_status_log').insert({
        community_id: id,
        previous_status: waterRes.data?.status ?? null,
        new_status: data.water_status,
        reason: data.water_status_reason?.trim() || null,
        changed_by: session.user.id,
      });
      if (error) throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error({ err: error }, 'Hinterland community update error');
    return NextResponse.json({ error: 'Failed to update community' }, { status: 500 });
  }
}
