import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { getAllModules } from '@/lib/modules/access';

// GET /api/admin/modules — list all modules (DG/minister/ps)
export async function GET() {
  const result = await requireRole(['dg', 'minister', 'ps']);
  if (result instanceof NextResponse) return result;

  const modules = await getAllModules();
  return NextResponse.json({ modules });
}
