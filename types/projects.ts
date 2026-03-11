// ── Project Types ──────────────────────────────────────────────────────────

export interface Project {
  id: string;
  project_id: string;
  executing_agency: string | null;
  sub_agency: string | null;
  project_name: string | null;
  region: string | null;
  contract_value: number | null;
  contractor: string | null;
  project_end_date: string | null;
  completion_pct: number;
  has_images: number;
  status: string;
  days_overdue: number;
  health: 'green' | 'amber' | 'red';
  escalated: boolean;
  escalation_reason: string | null;
  assigned_to: string | null;
  start_date: string | null;
  revised_start_date: string | null;
  project_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgencySummary {
  agency: string;
  total: number;
  complete: number;
  in_progress: number;
  delayed: number;
  not_started: number;
  total_value: number;
  avg_completion: number;
}

export interface PortfolioSummary {
  total_projects: number;
  total_value: number;
  complete: number;
  in_progress: number;
  delayed: number;
  not_started: number;
  delayed_value: number;
  at_risk: number;
  agencies: AgencySummary[];
  regions: Record<string, number>;
}

export interface ProjectNote {
  id: string;
  project_id: string;
  user_id: string;
  note_text: string;
  note_type: 'general' | 'escalation' | 'status_update';
  created_at: string;
  user_name?: string;
  user_role?: string;
}

export interface ProjectSummaryData {
  id: string;
  project_id: string;
  summary: {
    status_snapshot: string;
    timeline_assessment: string;
    budget_position: string;
    key_risks: string[];
    recommended_actions: string[];
  };
  generated_at: string;
}

export interface SavedFilter {
  id: string;
  filter_name: string;
  filter_params: Record<string, any>;
  created_at: string;
}

export type ViewMode = 'list' | 'board' | 'timeline';
