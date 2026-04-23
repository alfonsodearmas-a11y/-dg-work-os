import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';
import { SURFACE_CONDITIONS, VEGETATION_STATUSES } from '@/lib/airstrip-types';
import type { SurfaceCondition, VegetationStatus } from '@/lib/airstrip-types';

// POST /api/airstrips/[id]/inspections — add inspection + update airstrip
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
    if (authResult instanceof NextResponse) return authResult;
    const { session } = authResult;

    const { id } = await params;
    const body = await request.json();

    const {
      inspection_date, inspector_name, surface_condition, runway_condition_notes,
      vegetation_status, drainage_condition, buildings_condition,
      findings, recommendations, remarks, signal_available,
    } = body;

    if (!inspection_date) {
      return NextResponse.json({ error: 'Inspection date is required' }, { status: 400 });
    }
    if (surface_condition && !SURFACE_CONDITIONS.includes(surface_condition as SurfaceCondition)) {
      return NextResponse.json({ error: 'Invalid surface condition' }, { status: 400 });
    }
    if (vegetation_status && !VEGETATION_STATUSES.includes(vegetation_status as VegetationStatus)) {
      return NextResponse.json({ error: 'Invalid vegetation status' }, { status: 400 });
    }

    // Insert inspection + update airstrip in parallel
    const [inspectionRes, updateRes] = await Promise.all([
      supabaseAdmin.from('airstrip_inspections').insert({
        airstrip_id: id,
        inspection_date,
        inspector_name: inspector_name?.trim() || null,
        surface_condition: surface_condition || null,
        runway_condition_notes: runway_condition_notes?.trim() || null,
        vegetation_status: vegetation_status || null,
        drainage_condition: drainage_condition?.trim() || null,
        buildings_condition: buildings_condition?.trim() || null,
        findings: findings?.trim() || null,
        recommendations: recommendations?.trim() || null,
        remarks: remarks?.trim() || null,
        signal_available: signal_available ?? null,
        created_by: session.user.id,
      }).select().single(),
      supabaseAdmin.from('airstrips').update({
        // Only update surface_condition if the inspection assessed it
        ...(surface_condition ? { surface_condition } : {}),
        last_inspection_date: inspection_date,
        updated_by: session.user.id,
      }).eq('id', id),
    ]);

    if (inspectionRes.error) throw inspectionRes.error;
    if (updateRes.error) throw updateRes.error;

    return NextResponse.json({ inspection: inspectionRes.data }, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, 'Airstrip inspection error');
    return NextResponse.json({ error: 'Failed to add inspection' }, { status: 500 });
  }
}
