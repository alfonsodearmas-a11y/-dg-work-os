// Shared task types for the native tasks system

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
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority | null;
  due_date?: string | null;
  agency?: string | null;
  role?: string | null;
  blocked_reason?: string | null;
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
