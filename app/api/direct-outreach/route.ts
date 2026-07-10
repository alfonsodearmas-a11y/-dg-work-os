import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAccess } from '@/lib/auth-helpers';
import { LIST_LIMIT, getOpenCases, getSummary } from '@/lib/direct-outreach/queries';
import type { OutreachListFilters, OutreachSortField } from '@/lib/direct-outreach/types';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/** agency_manager sees only their own agency; a manager with no agency sees nothing. */
function agencyScopeFor(session: { user: { role: string; agency?: string | null } }): string | undefined {
  if (session.user.role !== 'agency_manager') return undefined;
  return (session.user.agency || 'NONE').toUpperCase();
}

const csv = (value: string | null): string[] | undefined => {
  const list = value?.split(',').filter(Boolean);
  return list?.length ? list : undefined;
};
const flag = (value: string | null): boolean => value === '1' || value === 'true';

export async function GET(request: NextRequest) {
  const authResult = await requireModuleAccess('direct-outreach');
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  const agencyScope = agencyScopeFor(session);
  const sp = request.nextUrl.searchParams;

  try {
    if (sp.get('view') === 'list') {
      const filters: OutreachListFilters = {
        agencies: csv(sp.get('agencies')),
        statuses: csv(sp.get('statuses')),
        themes: csv(sp.get('themes')),
        outreaches: csv(sp.get('outreaches')),
        regions: csv(sp.get('regions')),
        officers: csv(sp.get('officers')),
        workingStatuses: csv(sp.get('working')),
        assignedToMe: flag(sp.get('mine')) ? session.user.id : undefined,
        highPriority: flag(sp.get('high')),
        stalled60: flag(sp.get('stalled60')),
        stalled90: flag(sp.get('stalled90')),
        hasTarget: flag(sp.get('target')),
        overdue: flag(sp.get('overdue')),
        staleOfficer: flag(sp.get('stale')),
        officerOverdue: flag(sp.get('officer_overdue')),
        search: sp.get('search') || undefined,
        sort: (sp.get('sort') as OutreachSortField) || undefined,
        sort_dir: sp.get('sort_dir') === 'asc' ? 'asc' : sp.get('sort_dir') === 'desc' ? 'desc' : undefined,
      };
      const cases = await getOpenCases(filters, agencyScope);
      return NextResponse.json({ cases, total: cases.length, truncated: cases.length >= LIST_LIMIT });
    }

    const summary = await getSummary(agencyScope);
    return NextResponse.json(summary);
  } catch (err) {
    logger.error({ err }, '[direct-outreach] GET failed');
    return NextResponse.json({ error: 'Failed to load Direct Outreach data' }, { status: 500 });
  }
}
