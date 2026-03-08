import { NextResponse } from 'next/server';
import { sendTestPush } from '@/lib/push';
import { requireRole } from '@/lib/auth-helpers';
import { withErrorHandler } from '@/lib/api-utils';

export const POST = withErrorHandler(async () => {
  const authResult = await requireRole(['dg', 'minister', 'ps']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  const result = await sendTestPush(session.user.id);
  return NextResponse.json(result);
});
