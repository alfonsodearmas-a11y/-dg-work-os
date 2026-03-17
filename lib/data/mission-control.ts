import { supabaseAdmin } from '@/lib/db';
import { fetchTodayEvents } from '@/lib/google-calendar';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgencySnapshot {
  agency_slug: string;
  health_score: number | null;
  status: 'live' | 'building' | 'offline';
  kpi_snapshot: Record<string, unknown> | null;
  computed_at: string;
}

export interface MissionControlData {
  agencies: AgencySnapshot[];
  openTasks: number;
  overdueTasks: number;
  activeAlerts: number;
  gplPendingApplications: number;
  gwiPendingApplications: number;
  todayEvents: TodayEvent[];
  myTasks: MyTask[];
  notifications: MCNotification[];
}

export interface TodayEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  location: string | null;
}

export interface MyTask {
  id: string;
  title: string;
  priority: string | null;
  due_date: string | null;
  status: string;
}

export interface MCNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  category: string;
  created_at: string;
  reference_url: string | null;
}

// ── Fetcher ──────────────────────────────────────────────────────────────────

import { MINISTRY_ROLES } from '@/lib/people-types';

/**
 * Get mission control data scoped by the user's role and agency.
 * Ministry roles see all agencies; agency roles see only their own.
 */
export async function getMissionControlData(
  userId: string,
  role: string = 'dg',
  agency: string | null = null,
): Promise<MissionControlData> {
  // Agency scope: null = see all, string = filter to that agency
  const agencyScope = MINISTRY_ROLES.includes(role) ? null : agency;

  const [
    agenciesResult,
    openTasksResult,
    overdueTasksResult,
    alertsResult,
    gplPendingResult,
    gwiPendingResult,
    todayEventsResult,
    myTasksResult,
    notificationsResult,
  ] = await Promise.allSettled([
    fetchLatestSnapshots(agencyScope),
    fetchOpenTaskCount(agencyScope),
    fetchOverdueTaskCount(agencyScope),
    fetchActiveAlertCount(agencyScope),
    fetchPendingApplicationCount('GPL', agencyScope),
    fetchPendingApplicationCount('GWI', agencyScope),
    fetchTodayCalendarEvents(userId),
    fetchMyTasks(userId),
    fetchRecentNotifications(userId),
  ]);

  return {
    agencies: agenciesResult.status === 'fulfilled' ? agenciesResult.value : [],
    openTasks: openTasksResult.status === 'fulfilled' ? openTasksResult.value : 0,
    overdueTasks: overdueTasksResult.status === 'fulfilled' ? overdueTasksResult.value : 0,
    activeAlerts: alertsResult.status === 'fulfilled' ? alertsResult.value : 0,
    gplPendingApplications: gplPendingResult.status === 'fulfilled' ? gplPendingResult.value : 0,
    gwiPendingApplications: gwiPendingResult.status === 'fulfilled' ? gwiPendingResult.value : 0,
    todayEvents: todayEventsResult.status === 'fulfilled' ? todayEventsResult.value : [],
    myTasks: myTasksResult.status === 'fulfilled' ? myTasksResult.value : [],
    notifications: notificationsResult.status === 'fulfilled' ? notificationsResult.value : [],
  };
}

// ── Individual Queries ───────────────────────────────────────────────────────

async function fetchLatestSnapshots(agencyScope: string | null): Promise<AgencySnapshot[]> {
  // Get the latest snapshot per agency using distinct on agency_slug ordered by computed_at desc
  let query = supabaseAdmin
    .from('agency_health_snapshots')
    .select('agency_slug, health_score, status, kpi_snapshot, computed_at')
    .order('computed_at', { ascending: false });

  if (agencyScope) {
    query = query.eq('agency_slug', agencyScope.toLowerCase());
  }

  const { data, error } = await query;

  if (error) throw error;
  if (!data) return [];

  // Deduplicate: keep the latest per agency_slug
  const seen = new Set<string>();
  const latest: AgencySnapshot[] = [];
  for (const row of data) {
    if (!seen.has(row.agency_slug)) {
      seen.add(row.agency_slug);
      latest.push(row as AgencySnapshot);
    }
  }
  return latest;
}

async function fetchOpenTaskCount(agencyScope: string | null): Promise<number> {
  let query = supabaseAdmin
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .neq('status', 'done');

  if (agencyScope) {
    query = query.eq('agency', agencyScope.toLowerCase());
  }

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function fetchOverdueTaskCount(agencyScope: string | null): Promise<number> {
  const today = new Date().toISOString().split('T')[0];
  let query = supabaseAdmin
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .lt('due_date', today)
    .neq('status', 'done');

  if (agencyScope) {
    query = query.eq('agency', agencyScope.toLowerCase());
  }

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function fetchActiveAlertCount(agencyScope: string | null): Promise<number> {
  let query = supabaseAdmin
    .from('kpi_alerts')
    .select('id', { count: 'exact', head: true })
    .eq('resolved', false);

  if (agencyScope) {
    query = query.eq('agency_slug', agencyScope.toLowerCase());
  }

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function fetchPendingApplicationCount(agency: 'GPL' | 'GWI', agencyScope: string | null): Promise<number> {
  // If scoped to a different agency, don't fetch this agency's pending count
  if (agencyScope && agencyScope.toLowerCase() !== agency.toLowerCase()) {
    return 0;
  }

  const { count, error } = await supabaseAdmin
    .from('pending_applications')
    .select('id', { count: 'exact', head: true })
    .eq('agency', agency);

  if (error) throw error;
  return count ?? 0;
}

async function fetchTodayCalendarEvents(userId: string): Promise<TodayEvent[]> {
  const events = await fetchTodayEvents(userId);
  return events.slice(0, 6).map(e => ({
    id: e.google_id,
    title: e.title,
    start: e.start_time || '',
    end: e.end_time || '',
    location: e.location || null,
  }));
}

async function fetchMyTasks(userId: string): Promise<MyTask[]> {
  const { data, error } = await supabaseAdmin
    .from('tasks')
    .select('id, title, priority, due_date, status')
    .eq('owner_user_id', userId)
    .neq('status', 'done')
    .order('due_date', { ascending: true })
    .limit(4);

  if (error) throw error;
  return (data || []) as MyTask[];
}

async function fetchRecentNotifications(userId: string): Promise<MCNotification[]> {
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .select('id, title, body, type, category, created_at, reference_url')
    .eq('user_id', userId)
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) throw error;
  return (data || []) as MCNotification[];
}

// ── AI Briefing (static, no API call) ────────────────────────────────────────

export function generateStaticBriefing(data: MissionControlData): string {
  const liveAgencies = data.agencies.filter(a => a.status === 'live' && a.health_score !== null);
  const liveCount = liveAgencies.length;

  if (liveCount === 0) {
    return 'No agency health data available yet. Intel panels are being built — scores will appear as agencies come online.';
  }

  // Find lowest-scoring live agency
  const sorted = [...liveAgencies].sort((a, b) => (a.health_score ?? 0) - (b.health_score ?? 0));
  const lowest = sorted[0];
  const avgScore = Math.round(liveAgencies.reduce((s, a) => s + (a.health_score ?? 0), 0) / liveCount);

  const parts: string[] = [];

  parts.push(`${liveCount} ${liveCount === 1 ? 'agency' : 'agencies'} reporting with an average health score of ${avgScore}/100.`);

  if (lowest && lowest.health_score !== null && lowest.health_score < 85) {
    parts.push(`${lowest.agency_slug.toUpperCase()} is the lowest at ${lowest.health_score} — worth a closer look.`);
  }

  if (data.overdueTasks > 0) {
    parts.push(`${data.overdueTasks} overdue ${data.overdueTasks === 1 ? 'task requires' : 'tasks require'} attention.`);
  } else if (data.openTasks > 0) {
    parts.push(`${data.openTasks} open ${data.openTasks === 1 ? 'task' : 'tasks'} tracked, none overdue.`);
  }

  return parts.join(' ');
}
