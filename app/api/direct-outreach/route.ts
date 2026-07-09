import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAccess } from '@/lib/auth-helpers';
import { LIST_LIMIT, getOpenCases, getSummary } from '@/lib/direct-outreach/queries';
import type { BacklogFilter, OutreachListFilters, OutreachSortField } from '@/lib/direct-outreach/types';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const BACKLOG_FILTERS = new Set<BacklogFilter>(['all', 'stalled60', 'stalled90', 'target', 'overdue']);

/** agency_manager sees only their own agency; a manager with no agency sees nothing. */
function agencyScopeFor(session: { user: { role: string; agency?: string | null } }): string | undefined {
  if (session.user.role !== 'agency_manager') return undefined;
  return (session.user.agency || 'NONE').toUpperCase();
}

export async function GET(request: NextRequest) {
  const authResult = await requireModuleAccess('direct-outreach');
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  const agencyScope = agencyScopeFor(session);
  const sp = request.nextUrl.searchParams;

  try {
    if (sp.get('view') === 'list') {
      const backlog = sp.get('backlog') as BacklogFilter | null;
      const filters: OutreachListFilters = {
        agency: sp.get('agency') || undefined,
        status: sp.get('status') || undefined,
        theme: sp.get('theme') || undefined,
        backlog: backlog && BACKLOG_FILTERS.has(backlog) ? backlog : undefined,
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
