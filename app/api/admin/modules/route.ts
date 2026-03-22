import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { getAllModules } from '@/lib/modules/access';
import { withErrorHandler } from '@/lib/api-utils';

// GET /api/admin/modules — list all modules (DG/minister/ps)
export const GET = withErrorHandler(async (_req: NextRequest) => {
  const result = await requireRole(['dg', 'minister', 'ps']);
  if (result instanceof NextResponse) return result;

  const modules = await getAllModules();
  return NextResponse.json({ modules });
});
