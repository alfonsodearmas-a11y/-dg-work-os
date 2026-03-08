import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { withErrorHandler } from '@/lib/api-utils';

export const POST = withErrorHandler(async (_req: NextRequest) => {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  return NextResponse.json({ message: 'No-op: agencies are parsed directly from Excel' });
});
