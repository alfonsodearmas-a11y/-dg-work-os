import { NextRequest, NextResponse } from 'next/server';
import { requireAirstripAccess } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db-admin';
import { logger } from '@/lib/logger';
import { guyanaToday } from '@/lib/airstrip-types';

// POST /api/airstrips/[id]/contractor — set the responsible contractor.
// Atomically closes the current open assignment and opens a new one (RPC).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAirstripAccess();
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const contractorId = body?.contractor_id;
  if (!contractorId || typeof contractorId !== 'string') {
    return NextResponse.json({ error: 'contractor_id is required' }, { status: 400 });
  }

  const { data: contractor } = await supabaseAdmin
    .from('contractors').select('id').eq('id', contractorId).single();
  if (!contractor) {
    return NextResponse.json({ error: 'Contractor not found' }, { status: 404 });
  }

  const { error } = await supabaseAdmin.rpc('airstrip_assign_contractor', {
    p_airstrip_id: id,
    p_contractor_id: contractorId,
    p_user_id: session.user.id,
  });
  if (error) {
    logger.error({ err: error, id }, 'Airstrip contractor assignment failed');
    return NextResponse.json({ error: 'Failed to assign contractor' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

// DELETE /api/airstrips/[id]/contractor — clear the current responsible contractor.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAirstripAccess();
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const { error } = await supabaseAdmin
    .from('airstrip_contractors')
    .update({ effective_to: guyanaToday() })
    .eq('airstrip_id', id)
    .is('effective_to', null);
  if (error) {
    logger.error({ err: error, id }, 'Airstrip contractor clear failed');
    return NextResponse.json({ error: 'Failed to clear contractor' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
