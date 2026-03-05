// Shared task types for the native tasks system

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: 'not_started' | 'in_progress' | 'completed' | 'blocked';
  priority: 'low' | 'medium' | 'high' | 'urgent' | null;
  due_date: string | null;
  agency: string | null;
  role: string | null;
  owner_user_id: string;
  assigned_by_user_id: string | null;
  source_meeting_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskUpdate {
  title?: string;
  description?: string;
  status?: Task['status'];
  priority?: Task['priority'] | null;
  due_date?: string | null;
  agency?: string | null;
  role?: string | null;
}

export type TasksByStatus = {
  not_started: Task[];
  in_progress: Task[];
  blocked: Task[];
  completed: Task[];
};
