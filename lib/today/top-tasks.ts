import { supabaseAdmin } from '@/lib/db-admin';
import type { Role } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

export interface TopTask {
  id: string;
  title: string;
  priority: 'low' | 'medium' | 'high' | 'critical' | null;
  due_date: string | null;
}

export interface TopTasks {
  ok: boolean;
  items: TopTask[];
}

const PRIORITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export async function getTopOpenTasks(
  userId: string,
  role: Role,
  agency: string | null,
  limit = 3,
): Promise<TopTasks> {
  let query = supabaseAdmin
    .from('tasks')
    .select('id, title, priority, due_date, status, agency, owner_user_id')
    .in('status', ['new', 'active', 'blocked'])
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(50);

  // Two-level: agency managers see their agency's tasks, superadmins see all.
  if (role === 'agency_manager' && agency) {
    query = query.ilike('agency', agency);
  }

  const { data, error } = await query;
  if (error) {
    logger.warn({ error }, 'getTopOpenTasks: query failed');
    return { ok: false, items: [] };
  }

  const rows = (data ?? []) as Array<{ id: string; title: string; priority: TopTask['priority']; due_date: string | null }>;
  const sorted = rows.sort((a, b) => {
    const pa = PRIORITY_RANK[a.priority ?? 'low'] ?? 3;
    const pb = PRIORITY_RANK[b.priority ?? 'low'] ?? 3;
    if (pa !== pb) return pa - pb;
    if (a.due_date && b.due_date) return a.due_date < b.due_date ? -1 : 1;
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return 0;
  });

  return {
    ok: true,
    items: sorted.slice(0, limit).map(r => ({
      id: r.id,
      title: r.title,
      priority: r.priority,
      due_date: r.due_date,
    })),
  };
}
