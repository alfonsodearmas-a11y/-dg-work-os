import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';

// Actions are now sourced from the native tasks table — no Notion dependency

const AGENCIES = ['GPL', 'GWI', 'CJIA', 'GCAA', 'MARAD', 'HECI', 'PPDI', 'Cross-Agency', 'HAS'] as const;

const PRIORITY_WEIGHT: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

let cache: { data: ActionsResponse; expiry: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

interface Action {
  id: string;
  title: string;
  agency: string | null;
  dueDate: string | null;
  priority: string | null;
  status: string | null;
  overdueDays: number;
  staleDays: number;
  urgencyScore: number;
}

interface AgencyPulse {
  agency: string;
  openCount: number;
  overdueCount: number;
  staleCount: number;
  healthRatio: number;
}

interface ActionsResponse {
  overdue: Action[];
  dueToday: Action[];
  dueThisWeek: Action[];
  stale: Action[];
  agencyPulse: AgencyPulse[];
  summary: {
    totalOpen: number;
    totalOverdue: number;
    totalStale: number;
    criticalAgencies: string[];
  };
  cachedAt: string;
}

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 86_400_000;
  const aDay = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const bDay = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.floor((bDay.getTime() - aDay.getTime()) / msPerDay);
}

export async function GET() {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  if (cache && Date.now() < cache.expiry) {
    return NextResponse.json(cache.data);
  }

  try {
    const { data: rows, error } = await supabaseAdmin
      .from('tasks')
      .select('id, title, agency, due_date, priority, status, updated_at')
      .neq('status', 'done')
      .order('due_date', { ascending: true });

    if (error) throw error;

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);

    const actions: Action[] = (rows || []).map((r: any) => {
      const overdueDays = r.due_date && r.due_date < todayStr ? daysBetween(new Date(r.due_date), now) : 0;
      const staleDays = r.updated_at ? daysBetween(new Date(r.updated_at), now) : 0;
      const pWeight = PRIORITY_WEIGHT[r.priority || ''] || 1;
      return {
        id: r.id,
        title: r.title,
        agency: r.agency,
        dueDate: r.due_date,
        priority: r.priority,
        status: r.status,
        overdueDays,
        staleDays,
        urgencyScore: pWeight * 10 + overdueDays,
      };
    });

    const overdue = actions.filter(a => a.dueDate && a.dueDate < todayStr).sort((a, b) => b.urgencyScore - a.urgencyScore);
    const dueToday = actions.filter(a => a.dueDate === todayStr);
    const dueThisWeek = actions.filter(a => a.dueDate && a.dueDate > todayStr && a.dueDate <= weekEndStr);
    const stale = actions.filter(a => a.staleDays >= 7).sort((a, b) => b.staleDays - a.staleDays);

    const agencyMap = new Map<string, { open: number; overdue: number; stale: number; unhealthy: number }>();
    for (const ag of AGENCIES) agencyMap.set(ag, { open: 0, overdue: 0, stale: 0, unhealthy: 0 });

    for (const action of actions) {
      const ag = action.agency || 'Cross-Agency';
      const entry = agencyMap.get(ag) || { open: 0, overdue: 0, stale: 0, unhealthy: 0 };
      entry.open++;
      if (action.overdueDays > 0) entry.overdue++;
      if (action.staleDays >= 7) entry.stale++;
      if (action.overdueDays > 0 || action.staleDays >= 7) entry.unhealthy++;
      agencyMap.set(ag, entry);
    }

    const agencyPulse: AgencyPulse[] = [];
    for (const [agency, counts] of agencyMap) {
      if (counts.open === 0) continue;
      agencyPulse.push({
        agency,
        openCount: counts.open,
        overdueCount: counts.overdue,
        staleCount: counts.stale,
        healthRatio: Math.round(((counts.open - counts.unhealthy) / counts.open) * 100) / 100,
      });
    }
    agencyPulse.sort((a, b) => a.healthRatio - b.healthRatio);

    const result: ActionsResponse = {
      overdue,
      dueToday,
      dueThisWeek,
      stale,
      agencyPulse,
      summary: {
        totalOpen: actions.length,
        totalOverdue: overdue.length,
        totalStale: stale.length,
        criticalAgencies: agencyPulse.filter(a => a.healthRatio < 0.5 || a.overdueCount > 0).map(a => a.agency),
      },
      cachedAt: new Date().toISOString(),
    };

    cache = { data: result, expiry: Date.now() + CACHE_TTL_MS };
    return NextResponse.json(result);
  } catch (err) {
    logger.error({ err }, 'Briefing actions fetch failed');
    return NextResponse.json({ error: 'Failed to fetch briefing actions' }, { status: 500 });
  }
}
