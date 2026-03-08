import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { parseBody, apiError } from '@/lib/api-utils';
import { getSavedFilters, saveFilter, deleteFilter } from '@/lib/project-queries';

const saveFilterSchema = z.object({
  filter_name: z.string().min(1),
  filter_params: z.record(z.string(), z.unknown()).optional(),
});

export async function GET() {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const filters = await getSavedFilters(authResult.session.user.id);
    return NextResponse.json(filters);
  } catch (error) {
    console.error('Saved filters error:', error);
    return NextResponse.json({ error: 'Failed to fetch saved filters' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  const { data, error } = await parseBody(request, saveFilterSchema);
  if (error) return error;

  try {
    const saved = await saveFilter(authResult.session.user.id, data.filter_name.trim(), data.filter_params || {});
    return NextResponse.json(saved);
  } catch (err) {
    console.error('Save filter error:', err);
    return apiError('SAVE_FILTER_FAILED', 'Failed to save filter', 500);
  }
}

export async function DELETE(request: NextRequest) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await request.json();
    await deleteFilter(id, authResult.session.user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete filter error:', error);
    return NextResponse.json({ error: 'Failed to delete filter' }, { status: 500 });
  }
}
