import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { parseBody } from '@/lib/api-utils';
import { updateInterventionStatus } from '@/lib/delayed-projects/queries';

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
