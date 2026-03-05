import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; actionId: string }> }
) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;

  const { id, actionId } = await params;

  // Fetch current state
  const { data: action, error: fetchError } = await supabaseAdmin
    .from('meeting_actions')
    .select('id, done')
    .eq('id', actionId)
    .eq('meeting_id', id)
    .single();

  if (fetchError || !action) {
    return NextResponse.json({ error: 'Action item not found' }, { status: 404 });
  }

  // Toggle done
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('meeting_actions')
    .update({ done: !action.done })
    .eq('id', actionId)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ action: updated });
}
