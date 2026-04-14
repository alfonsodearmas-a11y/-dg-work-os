import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { parseBody } from '@/lib/api-utils';
import { updateInterventionStatus, getIntervention, deleteIntervention } from '@/lib/delayed-projects/queries';

export const dynamic = 'force-dynamic';

const UpdateSchema = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE']),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const parsed = await parseBody(request, UpdateSchema);
  if (parsed.error) return parsed.error;

  try {
    const intervention = await updateInterventionStatus(id, parsed.data.status);
    return NextResponse.json(intervention);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update intervention' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  const { id } = await params;

  // Fetch intervention to check ownership
  const intervention = await getIntervention(id);
  if (!intervention) {
    return NextResponse.json({ error: 'Intervention not found' }, { status: 404 });
  }

  // Only DG or the creator can delete
  const isDG = session.user.role === 'dg';
  const isCreator =
    intervention.created_by === session.user.name ||
    intervention.created_by === session.user.email;

  if (!isDG && !isCreator) {
    return NextResponse.json({ error: 'Only the Director General or the creator can delete an intervention' }, { status: 403 });
  }

  try {
    await deleteIntervention(id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to delete intervention' }, { status: 500 });
  }
}
