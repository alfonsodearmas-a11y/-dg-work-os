import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { withErrorHandler } from '@/lib/api-utils';
import { recalculateAllHealth } from '@/lib/project-queries';

export const POST = withErrorHandler(async (_req: NextRequest) => {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin']);
  if (authResult instanceof NextResponse) return authResult;

  const result = await recalculateAllHealth();
  return NextResponse.json(result);
});
