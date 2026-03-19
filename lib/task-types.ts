// Shared task types for the native tasks system

export const TASK_COLUMNS = 'id, title, description, status, priority, due_date, agency, role, owner_user_id, assigned_by_user_id, source_meeting_id, blocked_reason, completed_at, created_at, updated_at';

/** Flatten the Supabase owner join (may be array or object) into owner_name. */
export function flattenTaskOwner<T extends Record<string, unknown>>(row: T): T & { owner_name: string | null } {
  const ownerRaw = row.owner as unknown;
  const owner = (Array.isArray(ownerRaw) ? ownerRaw[0] : ownerRaw) as { id: string; name: string } | null;
  return { ...row, owner_name: owner?.name || null, owner: undefined } as T & { owner_name: string | null };
}

export type TaskStatus = 'new' | 'active' | 'blocked' | 'done';
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
  done: Task[];
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
