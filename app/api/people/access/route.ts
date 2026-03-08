import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { checkPermission, grantObjectAccess, getObjectGrants, revokeObjectAccess, logActivity } from '@/lib/people-permissions';
import type { AccessLevel } from '@/lib/people-types';
import { parseBody, withErrorHandler } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  const { searchParams } = new URL(request.url);
  const objectType = searchParams.get('objectType');
  const objectId = searchParams.get('objectId') || undefined;

  if (!objectType) {
    return NextResponse.json({ error: 'objectType is required' }, { status: 400 });
  }

  const grants = await getObjectGrants(objectType, objectId);
  return NextResponse.json({ grants });
}

const accessSchema = z.object({
  targetUserId: z.string().min(1),
  objectType: z.string().min(1),
  objectId: z.string().min(1).optional(),
  accessLevel: z.enum(['view', 'edit', 'manage']),
  reason: z.string().optional(),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  const hasPermission = await checkPermission(session.user.id, 'user.manage_roles');
  const hasSharePermission = await checkPermission(session.user.id, 'dashboard.share');

  if (!hasPermission && !hasSharePermission) {
    await logActivity({
      userId: session.user.id,
      action: 'grant_access',
      result: 'denied',
      denialReason: 'Missing permission to grant access',
    });
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const { data, error } = await parseBody(request, accessSchema);
  if (error) return error;

  const result = await grantObjectAccess({
    granterId: session.user.id,
    targetUserId: data!.targetUserId,
    objectType: data!.objectType,
    objectId: data!.objectId || null,
    accessLevel: data!.accessLevel,
    reason: data!.reason,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 201 });
});

export async function DELETE(request: NextRequest) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  const { searchParams } = new URL(request.url);
  const grantId = searchParams.get('grantId');

  if (!grantId) {
    return NextResponse.json({ error: 'grantId is required' }, { status: 400 });
  }

  const result = await revokeObjectAccess(grantId, session.user.id);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
