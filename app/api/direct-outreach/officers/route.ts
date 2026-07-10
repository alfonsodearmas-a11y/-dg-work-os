// Direct Outreach — the superadmin assignment picker: every active HUMAN user
// in the system (any agency, any role; only role='system' service accounts and
// deactivated users are excluded). Superadmin-only: agency managers keep the
// case-agency-scoped picker (/api/tasks/users?agency=) per locked Q2/Q3.

import { NextResponse } from 'next/server';
import { requireModuleAccess } from '@/lib/auth-helpers';
import { getAssignableOfficers } from '@/lib/direct-outreach/queries';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  const authResult = await requireModuleAccess('direct-outreach');
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  if (session.user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  try {
    const users = await getAssignableOfficers();
    return NextResponse.json({ users });
  } catch (err) {
    logger.error({ err }, '[direct-outreach] officers list failed');
    return NextResponse.json({ error: 'Failed to load officers' }, { status: 500 });
  }
}
