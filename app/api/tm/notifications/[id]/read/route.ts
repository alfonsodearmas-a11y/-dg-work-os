import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { markNotificationRead } from '@/lib/task-notifications';
import { apiError, withErrorHandler } from '@/lib/api-utils';

export const PATCH = withErrorHandler(async (request: NextRequest, ctx?: unknown) => {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
    await markNotificationRead(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return apiError('INTERNAL_ERROR', error.message, 500);
  }
});
