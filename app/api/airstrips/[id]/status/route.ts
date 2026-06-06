import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';
import { AIRSTRIP_STATUSES } from '@/lib/airstrip-types';
import type { AirstripStatus } from '@/lib/airstrip-types';

// PATCH /api/airstrips/[id]/status — change airstrip status
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
    const { new_status, reason } = body;

    if (!new_status || !AIRSTRIP_STATUSES.includes(new_status as AirstripStatus)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    if (!reason?.trim()) {
      return NextResponse.json({ error: 'Reason is required' }, { status: 400 });
    }

    // Get current status
    const { data: airstrip, error: fetchError } = await supabaseAdmin
      .from('airstrips')
      .select('status')
      .eq('id', id)
      .single();

    if (fetchError || !airstrip) {
      return NextResponse.json({ error: 'Airstrip not found' }, { status: 404 });
    }

    const previous_status = airstrip.status;

    // Update status and log in parallel
    const [updateRes, logRes] = await Promise.all([
      supabaseAdmin.from('airstrips').update({ status: new_status, updated_by: session.user.id }).eq('id', id),
      supabaseAdmin.from('airstrip_status_log').insert({
        airstrip_id: id,
        previous_status,
        new_status,
        changed_by: session.user.id,
        reason: reason.trim(),
      }),
    ]);

    if (updateRes.error) throw updateRes.error;
    if (logRes.error) throw logRes.error;

    return NextResponse.json({ success: true, previous_status, new_status });
  } catch (error) {
    logger.error({ err: error }, 'Airstrip status change error');
    return NextResponse.json({ error: 'Failed to change status' }, { status: 500 });
  }
}
