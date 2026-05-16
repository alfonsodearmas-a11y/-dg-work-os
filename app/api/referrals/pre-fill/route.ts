import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { resolvePreFill } from '@/lib/referrals/pre-fill';
import type { ReferralSourceType } from '@/lib/referrals/types';

export const runtime = 'nodejs';

const VALID_SOURCE_TYPES: ReferralSourceType[] = ['tender', 'project', 'agency_issue', 'other'];

export async function GET(request: NextRequest) {
  const auth = await requireRole(['dg']);
  if (auth instanceof NextResponse) return auth;

  const sp = request.nextUrl.searchParams;
  const sourceType = sp.get('source_type') as ReferralSourceType | null;
  const sourceId = sp.get('source_id');

  if (!sourceType || !VALID_SOURCE_TYPES.includes(sourceType)) {
    return NextResponse.json({ error: 'Invalid source_type' }, { status: 400 });
  }

  const preFill = await resolvePreFill(sourceType, sourceId);
  return NextResponse.json({ preFill });
}
