import { NextResponse } from 'next/server';
import { requireRole, canAccessAgency } from '@/lib/auth-helpers';
import { getPackageById } from '@/lib/procurement-queries';

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
      return NextResponse.json({ error: 'Package not found' }, { status: 404 });
    }

    // Agency roles must belong to the package's agency
    if (!canAccessAgency(session.user.role, session.user.agency, pkg.agency)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    return NextResponse.json({ package: pkg });
  } catch (err) {
    console.error('Error fetching procurement package:', err);
    return NextResponse.json({ error: 'Failed to fetch package' }, { status: 500 });
  }
}
