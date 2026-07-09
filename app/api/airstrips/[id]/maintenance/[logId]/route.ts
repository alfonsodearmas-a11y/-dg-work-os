import { NextRequest, NextResponse } from 'next/server';
import { requireAirstripAccess } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db-admin';
import { logger } from '@/lib/logger';
import { ACTIVITY_TYPES, VERIFICATION_METHODS, quarterFromISODate } from '@/lib/airstrip-types';
import type { ActivityType, VerificationMethod } from '@/lib/airstrip-types';

// PATCH /api/airstrips/[id]/maintenance/[logId] — edit a maintenance log
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; logId: string }> },
) {
  try {
    const authResult = await requireAirstripAccess();
    if (authResult instanceof NextResponse) return authResult;

    const { id, logId } = await params;
    const body = await request.json();

    const updates: Record<string, unknown> = {};

    if (body.activity_type !== undefined) {
      if (!ACTIVITY_TYPES.includes(body.activity_type as ActivityType)) {
        return NextResponse.json({ error: 'Invalid activity type' }, { status: 400 });
      }
      updates.activity_type = body.activity_type;
    }
    if (body.activity_description !== undefined) {
      updates.activity_description = body.activity_description?.toString().trim() || null;
    }
    if (body.performed_date !== undefined) {
      if (!body.performed_date) {
        return NextResponse.json({ error: 'Performed date cannot be empty' }, { status: 400 });
      }
      const quarter = quarterFromISODate(String(body.performed_date));
      if (!quarter) {
        return NextResponse.json({ error: 'Invalid performed date' }, { status: 400 });
      }
      updates.performed_date = body.performed_date;
      updates.quarter = quarter;
    }
    if (body.contractor_name !== undefined) {
      updates.contractor_name = body.contractor_name?.toString().trim() || null;
    }
    if (body.verification_method !== undefined) {
      if (!VERIFICATION_METHODS.includes(body.verification_method as VerificationMethod)) {
        return NextResponse.json({ error: 'Invalid verification method' }, { status: 400 });
      }
      updates.verification_method = body.verification_method;
    }
    if (body.notes !== undefined) {
      updates.notes = body.notes?.toString().trim() || null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('airstrip_maintenance_log')
      .update(updates)
      .eq('id', logId)
      .eq('airstrip_id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Maintenance log not found' }, { status: 404 });

    return NextResponse.json({ maintenance: data });
  } catch (error) {
    logger.error({ err: error }, 'Airstrip maintenance log edit error');
    return NextResponse.json({ error: 'Failed to update maintenance log' }, { status: 500 });
  }
}

// DELETE /api/airstrips/[id]/maintenance/[logId] — delete a log
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; logId: string }> },
) {
  try {
    const authResult = await requireAirstripAccess();
    if (authResult instanceof NextResponse) return authResult;

    const { id, logId } = await params;

    const { error } = await supabaseAdmin
      .from('airstrip_maintenance_log')
      .delete()
      .eq('id', logId)
      .eq('airstrip_id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Airstrip maintenance log delete error');
    return NextResponse.json({ error: 'Failed to delete maintenance log' }, { status: 500 });
  }
}
