import { NextResponse } from 'next/server';
import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const ACTIONS_DB_ID = '9fd316654d4b492ba949f552624b22aa';

const AGENCIES = ['GPL', 'GWI', 'CJIA', 'GCAA', 'MARAD', 'HECI', 'PPDI', 'Cross-Agency', 'HAS'] as const;
type Agency = (typeof AGENCIES)[number];

const PRIORITY_WEIGHT: Record<string, number> = { High: 3, Medium: 2, Low: 1 };

// --- In-memory cache (5 min TTL) ---
let cache: { data: ActionsResponse; expiry: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

// --- Types ---

interface Action {
  id: string;
  title: string;
  agency: string | null;
  assignee: string | null;
  dueDate: string | null;
  priority: string | null;
  status: string | null;
  sourceMeeting: string | null;
  notes: string | null;
  url: string;
  createdAt: string;
  lastEditedAt: string;
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

// --- Helpers ---

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 86_400_000;
  const aDay = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const bDay = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.floor((bDay.getTime() - aDay.getTime()) / msPerDay);
}

function getPlainText(prop: any): string | null {
  if (!prop) return null;
  if (prop.type === 'title') return prop.title?.[0]?.plain_text || null;
  if (prop.type === 'rich_text') return prop.rich_text?.[0]?.plain_text || null;
  return null;
}

function parseAction(page: any): Action {
  const props = page.properties;
  const now = new Date();

  const title = getPlainText(props['Action']) || 'Untitled';
  const agency = props['Agency']?.select?.name || null;
  const assignee = props['Assignee']?.people?.[0]?.name || null;
  const dueDate = props['Due']?.date?.start || null;
  const priority = props['Priority']?.select?.name || null;
  const status = props['Status']?.status?.name || null;
  const sourceMeeting = getPlainText(props['Source meeting']) || null;
  const notes = getPlainText(props['Notes']) || null;

  const overdueDays = dueDate ? Math.max(0, daysBetween(new Date(dueDate), now)) : 0;
  const staleDays = daysBetween(new Date(page.last_edited_time), now);
  const pWeight = PRIORITY_WEIGHT[priority || ''] || 1;
  const urgencyScore = pWeight * 10 + overdueDays;

  return {
    id: page.id,
    title,
    agency,
    assignee,
    dueDate,
    priority,
    status,
    sourceMeeting,
    notes,
    url: page.url,
    createdAt: page.created_time,
    lastEditedAt: page.last_edited_time,
    overdueDays,
    staleDays,
    urgencyScore,
  };
}

// --- Route ---

export async function GET() {
  // Return cached if fresh
  if (cache && Date.now() < cache.expiry) {
    return NextResponse.json(cache.data);
  }

  try {
    // Query all non-Done actions
    const pages: any[] = [];
    let cursor: string | undefined;

    do {
      const response: any = await notion.databases.query({
        database_id: ACTIONS_DB_ID,
        filter: {
          property: 'Status',
          status: { does_not_equal: 'Done' },
        },
        sorts: [{ property: 'Due', direction: 'ascending' }],
        start_cursor: cursor,
        page_size: 100,
      });
      pages.push(...response.results);
      cursor = response.has_more ? response.next_cursor : undefined;
    } while (cursor);

    const actions = pages.map(parseAction);
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);

    // Classify
    const overdue = actions
      .filter(a => a.dueDate && a.dueDate < todayStr)
      .sort((a, b) => b.urgencyScore - a.urgencyScore);

    const dueToday = actions.filter(a => a.dueDate === todayStr);

    const dueThisWeek = actions.filter(
      a => a.dueDate && a.dueDate > todayStr && a.dueDate <= weekEndStr
    );

    const stale = actions
      .filter(a => a.staleDays >= 7)
      .sort((a, b) => b.staleDays - a.staleDays);

    // Agency pulse
    const agencyMap = new Map<string, { open: number; overdue: number; stale: number; unhealthy: number }>();
    for (const ag of AGENCIES) {
      agencyMap.set(ag, { open: 0, overdue: 0, stale: 0, unhealthy: 0 });
    }

    for (const action of actions) {
      const ag = action.agency || 'Cross-Agency';
      const entry = agencyMap.get(ag) || { open: 0, overdue: 0, stale: 0, unhealthy: 0 };
      entry.open++;
      const isOverdue = action.overdueDays > 0;
      const isStale = action.staleDays >= 7;
      if (isOverdue) entry.overdue++;
      if (isStale) entry.stale++;
      if (isOverdue || isStale) entry.unhealthy++;
      agencyMap.set(ag, entry);
    }

    const agencyPulse: AgencyPulse[] = [];
    for (const [agency, counts] of agencyMap) {
      if (counts.open === 0) continue;
      // healthRatio: fraction of actions that are neither overdue nor stale
      const healthRatio = Math.round(((counts.open - counts.unhealthy) / counts.open) * 100) / 100;
      agencyPulse.push({
        agency,
        openCount: counts.open,
        overdueCount: counts.overdue,
        staleCount: counts.stale,
        healthRatio,
      });
    }
    agencyPulse.sort((a, b) => a.healthRatio - b.healthRatio);

    // Critical agencies: healthRatio < 0.5 or any overdue
    const criticalAgencies = agencyPulse
      .filter(a => a.healthRatio < 0.5 || a.overdueCount > 0)
      .map(a => a.agency);

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
        criticalAgencies,
      },
      cachedAt: new Date().toISOString(),
    };

    // Cache
    cache = { data: result, expiry: Date.now() + CACHE_TTL_MS };

    return NextResponse.json(result);
  } catch (err) {
    console.error('[Briefing Actions] Error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
