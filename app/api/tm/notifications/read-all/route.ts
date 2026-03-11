import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { markAllNotificationsRead } from '@/lib/task-notifications';
import { apiError, withErrorHandler } from '@/lib/api-utils';

export const POST = withErrorHandler(async (request: NextRequest) => {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    await markAllNotificationsRead(authResult.session.user.id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return apiError('INTERNAL_ERROR', error.message, 500);
  }
});
