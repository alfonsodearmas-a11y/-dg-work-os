import { NextRequest, NextResponse } from 'next/server';
import { requireAirstripAccess } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { parseBody } from '@/lib/api-utils';

const COLS = 'id, name, contact, whatsapp, active, notes, created_at';

// GET /api/airstrips/contractors — directory (active first, then by name).
export async function GET(request: NextRequest) {
  const authResult = await requireAirstripAccess();
  if (authResult instanceof NextResponse) return authResult;

  const activeOnly = request.nextUrl.searchParams.get('active') === 'true';
  let query = supabaseAdmin.from('contractors').select(COLS).order('active', { ascending: false }).order('name');
  if (activeOnly) query = query.eq('active', true);

  const { data, error } = await query;
  if (error) {
    logger.error({ err: error }, 'Contractors list error');
    return NextResponse.json({ error: 'Failed to fetch contractors' }, { status: 500 });
  }
  return NextResponse.json({ contractors: data ?? [] });
}

const createSchema = z.object({
  name: z.string().min(1, 'Name is required').trim(),
  contact: z.string().trim().nullable().optional(),
  whatsapp: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
});

// POST /api/airstrips/contractors — create a contractor.
export async function POST(request: NextRequest) {
  const authResult = await requireAirstripAccess();
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  const { data, error: validationError } = await parseBody(request, createSchema);
  if (validationError) return validationError;

  const { data: contractor, error } = await supabaseAdmin
    .from('contractors')
    .insert({
      name: data.name,
      contact: data.contact ?? null,
      whatsapp: data.whatsapp ?? null,
      notes: data.notes ?? null,
      created_by: session.user.id,
    })
    .select(COLS)
    .single();
  if (error) {
    logger.error({ err: error }, 'Contractor create error');
    return NextResponse.json({ error: 'Failed to create contractor' }, { status: 500 });
  }
  return NextResponse.json({ contractor }, { status: 201 });
}
