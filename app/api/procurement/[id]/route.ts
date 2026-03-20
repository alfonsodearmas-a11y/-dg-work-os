import { NextResponse } from 'next/server';
import { requireRole, canAccessAgency } from '@/lib/auth-helpers';
import { getPackageById, getPackageSummary, deletePackage } from '@/lib/procurement-queries';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const { id } = await params;

  try {
    const pkg = await getPackageById(id);
    if (!pkg) {
      return NextResponse.json({ error: 'Tender not found' }, { status: 404 });
    }

    // Agency roles must belong to the package's agency
    if (!canAccessAgency(session.user.role, session.user.agency, pkg.agency)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    return NextResponse.json({ package: pkg });
  } catch (err) {
    console.error('Error fetching procurement package:', err);
    return NextResponse.json({ error: 'Failed to fetch tender' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole(['dg', 'agency_admin']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const { id } = await params;

  try {
    const pkg = await getPackageSummary(id);
    if (!pkg) {
      return NextResponse.json({ error: 'Tender not found' }, { status: 404 });
    }

    // Agency admins can only delete their own agency's packages
    if (session.user.role !== 'dg' && pkg.agency.toLowerCase() !== session.user.agency?.toLowerCase()) {
      return NextResponse.json({ error: 'Cannot delete tenders from another agency' }, { status: 403 });
    }

    await deletePackage(id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error deleting procurement package:', err);
    return NextResponse.json({ error: 'Failed to delete tender' }, { status: 500 });
  }
}
