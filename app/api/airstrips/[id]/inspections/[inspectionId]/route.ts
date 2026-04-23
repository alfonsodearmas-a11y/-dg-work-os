import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';
import { SURFACE_CONDITIONS, VEGETATION_STATUSES } from '@/lib/airstrip-types';
import type { SurfaceCondition, VegetationStatus } from '@/lib/airstrip-types';

// PATCH /api/airstrips/[id]/inspections/[inspectionId] — edit an inspection
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; inspectionId: string }> },
) {
  try {
    const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
    if (authResult instanceof NextResponse) return authResult;
    const { session } = authResult;

    const { id, inspectionId } = await params;
    const body = await request.json();

    const updates: Record<string, unknown> = {};

    if (body.inspection_date !== undefined) {
      if (!body.inspection_date) {
        return NextResponse.json({ error: 'Inspection date cannot be empty' }, { status: 400 });
      }
      updates.inspection_date = body.inspection_date;
    }
    if (body.inspector_name !== undefined) {
      updates.inspector_name = body.inspector_name?.toString().trim() || null;
    }
    if (body.surface_condition !== undefined) {
      if (body.surface_condition && !SURFACE_CONDITIONS.includes(body.surface_condition as SurfaceCondition)) {
        return NextResponse.json({ error: 'Invalid surface condition' }, { status: 400 });
      }
      updates.surface_condition = body.surface_condition || null;
    }
    if (body.runway_condition_notes !== undefined) {
      updates.runway_condition_notes = body.runway_condition_notes?.toString().trim() || null;
    }
    if (body.vegetation_status !== undefined) {
      if (body.vegetation_status && !VEGETATION_STATUSES.includes(body.vegetation_status as VegetationStatus)) {
        return NextResponse.json({ error: 'Invalid vegetation status' }, { status: 400 });
      }
      updates.vegetation_status = body.vegetation_status || null;
    }
    if (body.drainage_condition !== undefined) {
      updates.drainage_condition = body.drainage_condition?.toString().trim() || null;
    }
    if (body.buildings_condition !== undefined) {
      updates.buildings_condition = body.buildings_condition?.toString().trim() || null;
    }
    if (body.findings !== undefined) {
      updates.findings = body.findings?.toString().trim() || null;
    }
    if (body.recommendations !== undefined) {
      updates.recommendations = body.recommendations?.toString().trim() || null;
    }
    if (body.remarks !== undefined) {
      updates.remarks = body.remarks?.toString().trim() || null;
    }
    if (body.signal_available !== undefined) {
      updates.signal_available = body.signal_available ?? null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('airstrip_inspections')
      .update(updates)
      .eq('id', inspectionId)
      .eq('airstrip_id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });

    // Mirror surface_condition back to the airstrip record when it changes,
    // matching the create route's side effect.
    if (updates.surface_condition !== undefined) {
      await supabaseAdmin
        .from('airstrips')
        .update({
          surface_condition: updates.surface_condition,
          updated_by: session.user.id,
        })
        .eq('id', id);
    }

    return NextResponse.json({ inspection: data });
  } catch (error) {
    logger.error({ err: error }, 'Airstrip inspection edit error');
    return NextResponse.json({ error: 'Failed to update inspection' }, { status: 500 });
  }
}

// DELETE /api/airstrips/[id]/inspections/[inspectionId]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; inspectionId: string }> },
) {
  try {
    const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin']);
    if (authResult instanceof NextResponse) return authResult;

    const { id, inspectionId } = await params;

    const { error } = await supabaseAdmin
      .from('airstrip_inspections')
      .delete()
      .eq('id', inspectionId)
      .eq('airstrip_id', id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Airstrip inspection delete error');
    return NextResponse.json({ error: 'Failed to delete inspection' }, { status: 500 });
  }
}
