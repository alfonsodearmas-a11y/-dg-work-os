import { NextRequest, NextResponse } from 'next/server';
import { authenticateAny, AuthError } from '@/lib/auth';
import { markNotificationRead } from '@/lib/task-notifications';
import { apiError, withErrorHandler } from '@/lib/api-utils';

export const PATCH = withErrorHandler(async (request: NextRequest, ctx?: unknown) => {
  try {
    await authenticateAny(request);
    const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
    await markNotificationRead(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    return apiError('INTERNAL_ERROR', error.message, 500);
  }
});
