import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';

// No longer needed — sub_agency comes directly from Excel column
export async function POST() {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  return NextResponse.json({ message: 'No-op: agencies are parsed directly from Excel' });
}
