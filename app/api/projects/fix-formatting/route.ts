import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';

// No longer needed — formatting is handled at parse time
export async function POST() {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  return NextResponse.json({ message: 'No-op: formatting is handled during Excel parsing' });
}
