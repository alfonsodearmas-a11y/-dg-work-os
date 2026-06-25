import { NextRequest, NextResponse } from 'next/server';
import { requireAirstripAccess } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { parseBody } from '@/lib/api-utils';

const COLS = 'id, name, contact, whatsapp, active, notes, created_at';

const patchSchema = z.object({
  name: z.string().min(1).trim().optional(),
  contact: z.string().trim().nullable().optional(),
  whatsapp: z.string().trim().nullable().optional(),
  active: z.boolean().optional(),
  notes: z.string().trim().nullable().optional(),
});

// PATCH /api/airstrips/contractors/[id] — edit details or activate/deactivate.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAirstripAccess();
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const { data, error: validationError } = await parseBody(request, patchSchema);
  if (validationError) return validationError;
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data: contractor, error } = await supabaseAdmin
    .from('contractors').update(data).eq('id', id).select(COLS).single();
  if (error || !contractor) {
    if (error) logger.error({ err: error }, 'Contractor update error');
    return NextResponse.json({ error: 'Failed to update contractor' }, { status: error ? 500 : 404 });
  }
  return NextResponse.json({ contractor });
}
