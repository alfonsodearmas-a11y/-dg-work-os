import { NextRequest, NextResponse } from 'next/server';
import { authenticateAny, AuthError } from '@/lib/auth';
import { markAllNotificationsRead } from '@/lib/task-notifications';
import { apiError, withErrorHandler } from '@/lib/api-utils';

export const POST = withErrorHandler(async (request: NextRequest) => {
  try {
    const user = await authenticateAny(request);
    await markAllNotificationsRead(user.id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    return apiError('INTERNAL_ERROR', error.message, 500);
  }
});
