import { NextResponse, NextRequest } from 'next/server';
import { requireRole, canAccessAgency } from '@/lib/auth-helpers';
import { getPackageById, getPackageSummary, deletePackage, updatePackagePsipRef } from '@/lib/procurement-queries';
import { PSIP_AGENCY, PSIP_REF_PATTERN } from '@/lib/procurement-types';
import { logger } from '@/lib/logger';

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
    logger.error({ err, context: 'procurement' }, 'Error fetching procurement package');
    return NextResponse.json({ error: 'Failed to fetch tender' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole(['dg', 'agency_admin']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const { id } = await params;

  try {
    const body = await request.json();
    const { psip_ref } = body as { psip_ref?: string | null };

    // Only psip_ref is editable via this endpoint.
    if (psip_ref === undefined) {
      return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 });
    }

    const pkg = await getPackageSummary(id);
    if (!pkg) return NextResponse.json({ error: 'Tender not found' }, { status: 404 });

    if (pkg.agency.toUpperCase() !== PSIP_AGENCY) {
      return NextResponse.json({ error: `PSIP ref is only applicable to ${PSIP_AGENCY} records` }, { status: 400 });
    }
    if (session.user.role !== 'dg' && session.user.agency?.toUpperCase() !== PSIP_AGENCY) {
      return NextResponse.json({ error: 'Cannot edit tenders from another agency' }, { status: 403 });
    }

    let normalizedRef: string | null = null;
    if (psip_ref !== null && psip_ref !== '') {
      const trimmed = String(psip_ref).trim().toUpperCase();
      if (!PSIP_REF_PATTERN.test(trimmed)) {
        return NextResponse.json(
          { error: 'PSIP ref must look like H-001, C-015, or U-004' },
          { status: 400 },
        );
      }
      normalizedRef = trimmed;
    }

    const { conflict } = await updatePackagePsipRef(id, normalizedRef);
    if (conflict) {
      return NextResponse.json(
        { error: `Another ${PSIP_AGENCY} tender already uses ${normalizedRef}` },
        { status: 409 },
      );
    }

    return NextResponse.json({ success: true, psip_ref: normalizedRef });
  } catch (err) {
    logger.error({ err, context: 'procurement' }, 'Error updating procurement psip_ref');
    return NextResponse.json({ error: 'Failed to update tender' }, { status: 500 });
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
    logger.error({ err, context: 'procurement' }, 'Error deleting procurement package');
    return NextResponse.json({ error: 'Failed to delete tender' }, { status: 500 });
  }
}
