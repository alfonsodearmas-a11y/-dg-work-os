import { NextRequest, NextResponse } from 'next/server';
import { requireAirstripAccess } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db-admin';
import { logger } from '@/lib/logger';
import { AIRSTRIP_STATUSES } from '@/lib/airstrip-types';
import type { AirstripStatus } from '@/lib/airstrip-types';

// PATCH /api/airstrips/[id]/status — change airstrip status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAirstripAccess();
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

    // Atomic status change + log (single transaction — no update/log desync).
    const { data: result, error: rpcError } = await supabaseAdmin.rpc('airstrip_change_status', {
      p_airstrip_id: id,
      p_new_status: new_status,
      p_reason: reason.trim(),
      p_user_id: session.user.id,
    });

    if (rpcError) {
      if (rpcError.code === 'P0002' || /not found/i.test(rpcError.message)) {
        return NextResponse.json({ error: 'Airstrip not found' }, { status: 404 });
      }
      throw rpcError;
    }

    const previous_status = (result as { previous_status?: string } | null)?.previous_status ?? null;
    return NextResponse.json({ success: true, previous_status, new_status });
  } catch (error) {
    logger.error({ err: error }, 'Airstrip status change error');
    return NextResponse.json({ error: 'Failed to change status' }, { status: 500 });
  }
}
