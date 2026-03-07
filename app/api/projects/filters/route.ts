import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { getSavedFilters, saveFilter, deleteFilter } from '@/lib/project-queries';

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

  try {
    const { filter_name, filter_params } = await request.json();

    if (!filter_name?.trim()) {
      return NextResponse.json({ error: 'Filter name is required' }, { status: 400 });
    }

    const saved = await saveFilter(authResult.session.user.id, filter_name.trim(), filter_params || {});
    return NextResponse.json(saved);
  } catch (error) {
    console.error('Save filter error:', error);
    return NextResponse.json({ error: 'Failed to save filter' }, { status: 500 });
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
