import { NextResponse, NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { getPackageSummary, updatePackageStage } from '@/lib/procurement-queries';
import { PROCUREMENT_STAGES, ProcurementStage } from '@/lib/procurement-types';

export async function POST(request: NextRequest) {
  const result = await requireRole(['dg', 'agency_admin']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  try {
    const body = await request.json();
    const { packageId, newStage, notes } = body as {
      packageId: string;
      newStage: ProcurementStage;
      notes?: string;
    };

    if (!packageId || !newStage) {
      return NextResponse.json({ error: 'packageId and newStage are required' }, { status: 400 });
    }

    // Validate newStage is a valid procurement stage
    if (!PROCUREMENT_STAGES.includes(newStage)) {
      return NextResponse.json({ error: 'Invalid stage' }, { status: 400 });
    }

    // Lightweight fetch to verify ownership and current stage
    const pkg = await getPackageSummary(packageId);
    if (!pkg) {
      return NextResponse.json({ error: 'Tender not found' }, { status: 404 });
    }

    // Verify the package belongs to user's agency (DG can advance any)
    if (session.user.role !== 'dg' && pkg.agency.toLowerCase() !== session.user.agency?.toLowerCase()) {
      return NextResponse.json({ error: 'Cannot advance tenders from another agency' }, { status: 403 });
    }

    // Prevent no-op (same stage)
    if (newStage === pkg.current_stage) {
      return NextResponse.json({ error: 'Tender is already at this stage' }, { status: 400 });
    }

    const updated = await updatePackageStage(packageId, newStage, session.user.id, notes);

    return NextResponse.json({ package: updated });
  } catch (err) {
    console.error('Error advancing procurement package:', err);
    return NextResponse.json({ error: 'Failed to advance tender' }, { status: 500 });
  }
}
