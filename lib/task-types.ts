// Shared task types for the native tasks system

export const TASK_COLUMNS = 'id, title, description, status, priority, due_date, agency, role, owner_user_id, assigned_by_user_id, source_meeting_id, blocked_reason, completed_at, created_at, updated_at, source, extraction_id, source_quote, source_timestamp, owner_name_raw, delegated_to_id, verb_category, completion_note, completed_by, verified_by, verified_at, dispute_note, disputed_at, supersedes_id, visibility_scope, confidence_overall, requires_minister_attention, referred_to_minister_at, referred_to_minister_by, minister_seen_at, minister_closed_at, linked_source_type, linked_source_id';

/** Flatten the Supabase owner join (may be array or object) into owner_name. */
export function flattenTaskOwner<T extends Record<string, unknown>>(row: T): T & { owner_name: string | null } {
  const ownerRaw = row.owner as unknown;
  const owner = (Array.isArray(ownerRaw) ? ownerRaw[0] : ownerRaw) as { id: string; name: string } | null;
  return { ...row, owner_name: owner?.name || null, owner: undefined } as T & { owner_name: string | null };
}

export type TaskStatus = 'new' | 'active' | 'blocked' | 'done' | 'awaiting_verification' | 'superseded';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority | null;
  due_date: string | null;
  agency: string | null;
  role: string | null;
  blocked_reason: string | null;
  completed_at: string | null;
  owner_user_id: string;
  owner_name: string | null;
  assigned_by_user_id: string | null;
  source_meeting_id: string | null;
  created_at: string;
  updated_at: string;
  source: 'manual' | 'extraction';
  extraction_id: string | null;
  source_quote: string | null;
  source_timestamp: string | null;
  owner_name_raw: string | null;
  delegated_to_id: string | null;
  verb_category: 'correspondence' | 'decision' | 'information' | 'scheduling' | 'project_update' | 'analysis' | null;
  completion_note: string | null;
  completed_by: string | null;
  verified_by: string | null;
  verified_at: string | null;
  dispute_note: string | null;
  disputed_at: string | null;
  supersedes_id: string | null;
  visibility_scope: 'agency_normal' | 'dg_only';
  confidence_overall: number | null;
  // Minister-attention fields. requires_minister_attention is the canonical
  // flag; the timestamps and the linked_source pair are populated when the
  // task is created or flagged via /api/tasks/refer or /api/tasks/[id]/refer.
  requires_minister_attention: boolean;
  referred_to_minister_at: string | null;
  referred_to_minister_by: string | null;
  minister_seen_at: string | null;
  minister_closed_at: string | null;
  linked_source_type: 'tender' | 'project' | null;
  linked_source_id: string | null;
}

export interface TaskUpdate {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority | null;
  due_date?: string | null;
  agency?: string | null;
  role?: string | null;
  blocked_reason?: string | null;
  owner_user_id?: string;
  owner_name?: string | null;
}

export type TasksByStatus = {
  new: Task[];
  active: Task[];
  blocked: Task[];
  awaiting_verification: Task[];
  done: Task[];
  superseded: Task[];
};

export interface TaskTemplate {
  id: string;
  name: string;
  description: string | null;
  agency_slug: string | null;
  priority: string;
  checklist: Array<{ label: string; done: boolean }> | null;
}

export interface Subtask {
  id: string;
  task_id: string;
  title: string;
  done: boolean;
  position: number;
  created_by: string | null;
  created_at: string;
}

export interface TaskActivity {
  id: string;
  task_id: string;
  user_id: string | null;
  user_name?: string | null;
  action: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}
