import { supabaseAdmin } from '@/lib/db-admin';

export type LinkedSourceType = 'tender' | 'project';

export interface FlaggedTaskSummary {
  id: string;
  title: string;
  agency: string | null;
  referred_to_minister_at: string;
  referred_to_minister_by: string;
  minister_seen_at: string | null;
  minister_closed_at: string | null;
  linked_source_type: LinkedSourceType | null;
  linked_source_id: string | null;
  referrer_name: string | null;
}

export interface FlaggedTaskPointer {
  taskId: string;
  flaggedAt: string;
}

/**
 * Tasks flagged for the Minister and still open. Powers /minister/attention.
 * Closed-for-minister tasks are excluded; the underlying task may still be
 * active on the Kanban.
 */
export async function listOpenFlaggedTasks(): Promise<FlaggedTaskSummary[]> {
  const { data, error } = await supabaseAdmin
    .from('tasks')
    .select(
      'id, title, agency, referred_to_minister_at, referred_to_minister_by, minister_seen_at, minister_closed_at, linked_source_type, linked_source_id, referrer:users!referred_to_minister_by(name)',
    )
    .eq('requires_minister_attention', true)
    .is('minister_closed_at', null)
    .order('referred_to_minister_at', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const referrerRaw = row.referrer as unknown;
    const referrer = referrerRaw
      ? ((Array.isArray(referrerRaw) ? referrerRaw[0] : referrerRaw) as { name: string | null } | null)
      : null;
    return {
      id: row.id,
      title: row.title,
      agency: row.agency,
      referred_to_minister_at: row.referred_to_minister_at,
      referred_to_minister_by: row.referred_to_minister_by,
      minister_seen_at: row.minister_seen_at,
      minister_closed_at: row.minister_closed_at,
      linked_source_type: row.linked_source_type as LinkedSourceType | null,
      linked_source_id: row.linked_source_id,
      referrer_name: referrer?.name ?? null,
    } as FlaggedTaskSummary;
  });
}

/**
 * Single-source lookup for the "Referred to Minister" banner on tender and
 * project rows. Returns the most-recent open flagged task for the given
 * upstream entity, or null if none.
 */
export async function getActiveFlaggedTaskForSource(
  sourceType: LinkedSourceType,
  sourceId: string,
): Promise<FlaggedTaskPointer | null> {
  const { data, error } = await supabaseAdmin
    .from('tasks')
    .select('id, referred_to_minister_at')
    .eq('linked_source_type', sourceType)
    .eq('linked_source_id', sourceId)
    .eq('requires_minister_attention', true)
    .is('minister_closed_at', null)
    .order('referred_to_minister_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.referred_to_minister_at) return null;
  return { taskId: data.id, flaggedAt: data.referred_to_minister_at };
}

/**
 * Bulk version of getActiveFlaggedTaskForSource. Used by lib/tender/queries
 * and lib/today/signals to enrich list rows without N+1 lookups.
 */
export async function getActiveFlaggedTasksForSources(
  sourceType: LinkedSourceType,
  sourceIds: string[],
): Promise<Map<string, FlaggedTaskPointer>> {
  const out = new Map<string, FlaggedTaskPointer>();
  if (sourceIds.length === 0) return out;
  const { data, error } = await supabaseAdmin
    .from('tasks')
    .select('id, linked_source_id, referred_to_minister_at')
    .eq('linked_source_type', sourceType)
    .in('linked_source_id', sourceIds)
    .eq('requires_minister_attention', true)
    .is('minister_closed_at', null)
    .order('referred_to_minister_at', { ascending: false, nullsFirst: false });
  if (error) throw error;
  for (const row of data ?? []) {
    if (!row.linked_source_id || !row.referred_to_minister_at) continue;
    if (out.has(row.linked_source_id)) continue;
    out.set(row.linked_source_id, {
      taskId: row.id,
      flaggedAt: row.referred_to_minister_at,
    });
  }
  return out;
}
