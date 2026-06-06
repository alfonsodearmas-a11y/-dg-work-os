import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';
import { ACTIVITY_TYPES, VERIFICATION_METHODS } from '@/lib/airstrip-types';
import type { ActivityType, VerificationMethod } from '@/lib/airstrip-types';

// GET /api/airstrips/[id]/maintenance — list maintenance logs
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireRole(['superadmin', 'agency_manager']);
    if (authResult instanceof NextResponse) return authResult;

    const { id } = await params;
    const { data, error } = await supabaseAdmin
      .from('airstrip_maintenance_log')
      .select('*')
      .eq('airstrip_id', id)
      .order('performed_date', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ maintenance: data ?? [] });
  } catch (error) {
    logger.error({ err: error }, 'Airstrip maintenance list error');
    return NextResponse.json({ error: 'Failed to fetch maintenance logs' }, { status: 500 });
  }
}

// POST /api/airstrips/[id]/maintenance — log maintenance activity
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireRole(['superadmin', 'agency_manager']);
    if (authResult instanceof NextResponse) return authResult;
    const { session } = authResult;

    const { id } = await params;
    const body = await request.json();

    const { activity_type, activity_description, performed_date, contractor_name, verification_method, notes } = body;

    if (!activity_type || !ACTIVITY_TYPES.includes(activity_type as ActivityType)) {
      return NextResponse.json({ error: 'Invalid activity type' }, { status: 400 });
    }
    if (!performed_date) {
      return NextResponse.json({ error: 'Performed date is required' }, { status: 400 });
    }
    if (!verification_method || !VERIFICATION_METHODS.includes(verification_method as VerificationMethod)) {
      return NextResponse.json({ error: 'Invalid verification method' }, { status: 400 });
    }

    // Auto-calculate quarter from performed_date
    const date = new Date(performed_date);
    const q = Math.ceil((date.getMonth() + 1) / 3);
    const quarter = `Q${q} ${date.getFullYear()}`;

    const { data, error } = await supabaseAdmin
      .from('airstrip_maintenance_log')
      .insert({
        airstrip_id: id,
        activity_type,
        activity_description: activity_description?.trim() || null,
        performed_date,
        quarter,
        contractor_name: contractor_name?.trim() || null,
        verification_method,
        verified: false,
        notes: notes?.trim() || null,
        created_by: session.user.id,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ maintenance: data }, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, 'Airstrip maintenance log error');
    return NextResponse.json({ error: 'Failed to log maintenance' }, { status: 500 });
  }
}

// PATCH /api/airstrips/[id]/maintenance — verify a maintenance entry
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireRole(['superadmin', 'agency_manager']);
    if (authResult instanceof NextResponse) return authResult;
    const { session } = authResult;

    const { id } = await params;
    const body = await request.json();
    const { maintenance_id } = body;

    if (!maintenance_id) {
      return NextResponse.json({ error: 'maintenance_id is required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('airstrip_maintenance_log')
      .update({
        verified: true,
        verified_by: session.user.id,
        verified_at: new Date().toISOString(),
      })
      .eq('id', maintenance_id)
      .eq('airstrip_id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Airstrip maintenance verify error');
    return NextResponse.json({ error: 'Failed to verify maintenance' }, { status: 500 });
  }
}
