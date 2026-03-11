// ── AI Cost Optimization — Shared Types ──────────────────────────────────────

export type ModelTier = 'haiku' | 'sonnet' | 'opus';

export type ContextLevel = 'minimal' | 'focused' | 'full';

export const MODEL_IDS: Record<ModelTier, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-5-20250929',
  opus: 'claude-opus-4-6',
};

export const MAX_TOKENS: Record<ModelTier, number> = {
  haiku: 2048,
  sonnet: 4096,
  opus: 8192,
};

export const TIER_LABELS: Record<ModelTier, string> = {
  haiku: 'Quick',
  sonnet: 'Standard',
  opus: 'Deep',
};

// ── Health / Snapshot ──

export interface AgencyHealth {
  score: number;      // 0-10
  label: string;      // Strong, Adequate, Concerning, Poor, Critical
  breakdown: string;  // e.g. "Reserve Margin 22.3%, 34/42 units online"
}

export interface MetricSnapshot {
  timestamp: string;
  gpl: {
    health: AgencyHealth;
    capacity_mw: number | null;
    peak_demand_mw: number | null;
    reserve_mw: number | null;
    units_online: number | null;
    units_total: number | null;
    suppressed_mw: number | null;
    report_date: string | null;
  };
  gwi: {
    health: AgencyHealth;
    net_profit: number | null;
    total_revenue: number | null;
    collections: number | null;
    resolution_rate_pct: number | null;
    active_accounts: number | null;
    report_month: string | null;
  };
  cjia: {
    health: AgencyHealth;
    total_passengers: number | null;
    on_time_pct: number | null;
    report_month: string | null;
  };
  gcaa: {
    health: AgencyHealth;
    compliance_rate_pct: number | null;
    total_inspections: number | null;
    incidents: number | null;
    report_month: string | null;
  };
  projects: {
    total: number;
    delayed: number;
    in_progress: number;
    complete: number;
    not_started: number;
    total_value: number;
  };
  tasks: {
    active: number;
    overdue: number;
    due_today: number;
  };
}

// ── Token Budget ──

export interface TokenBudgetStatus {
  used_today: number;
  daily_limit: number;
  pct: number;           // 0-100
  tier_cap: ModelTier;    // max tier allowed given current usage
  warning: string | null; // null if < 80%, message at 80%/95%/100%
}

// ── Cache ──

export interface CachedResponse {
  response_text: string;
  suggestions: string[] | null;
  actions: Array<{ label: string; route: string }> | null;
  model_tier: ModelTier;
  created_at: string;
}

// ── Chat SSE Events ──

export interface ChatMetaEvent {
  type: 'meta';
  tier: ModelTier;
  tier_label: string;
  cached: boolean;
  local: boolean;
}

export interface ChatTextEvent {
  type: 'text';
  text: string;
}

export interface ChatDoneEvent {
  type: 'done';
  tier: ModelTier;
  tier_label: string;
  cached: boolean;
  local: boolean;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  remaining: number;
}

export interface ChatErrorEvent {
  type: 'error';
  error: string;
}

export type ChatStreamEvent = ChatMetaEvent | ChatTextEvent | ChatDoneEvent | ChatErrorEvent | ChatToolUseEvent | ChatActionResultEvent;

// ── Raw Context Data (from context-engine) ──

export interface RawContextData {
  gpl: {
    summary: Record<string, unknown> | null;
    stations: Record<string, unknown>[];
    reportDate: string | null;
    kpis: Record<string, number>;
    kpiMonth: string | null;
  };
  gwi: {
    report: Record<string, any> | null;
    insights: Record<string, any> | null;
    complaints: Record<string, any> | null;
  };
  cjia: Record<string, any> | null;
  gcaa: Record<string, any> | null;
  portfolio: {
    total_projects: number;
    total_value: number;
    in_progress: number;
    delayed: number;
    complete: number;
    not_started: number;
    agencies: Array<{ agency: string; total: number; total_value: number; delayed: number }>;
  } | null;
  delayed: Array<Record<string, any>>;
  tasks: Array<{
    id?: string;
    title: string;
    status: string;
    priority?: string | null;
    due_date?: string | null;
    agency?: string | null;
    assigned_to?: string | null;
    assigned_to_name?: string | null;
  }>;
  todayEvents: Array<{
    title: string;
    start_time?: string | null;
    end_time?: string | null;
    location?: string | null;
    all_day?: boolean;
  }>;
  weekEvents: Array<{
    title: string;
    start_time?: string | null;
  }>;
  health: {
    gpl: AgencyHealth;
    gwi: AgencyHealth;
    cjia: AgencyHealth;
    gcaa: AgencyHealth;
  };
  gaps: string[];
  // ── Extended data sources ──
  meetings: Array<{
    id: string;
    title: string;
    meeting_date: string;
    status: string;
    attendees?: string[];
    summary?: string | null;
    action_items?: Array<{ description: string; assignee?: string; status?: string; due_date?: string }>;
  }>;
  budget: {
    sectors?: Array<{ sector: string; allocated: number; actual: number; variance_pct: number }>;
    agencies?: Array<{ agency: string; allocated: number; actual: number; variance_pct: number }>;
    total_allocated?: number;
    total_actual?: number;
  } | null;
  serviceConnections: {
    total_pending?: number;
    track_a_pending?: number;
    track_b_pending?: number;
    avg_days_pending?: number;
    overdue_count?: number;
    monthly_trend?: Array<{ month: string; received: number; completed: number }>;
  } | null;
  oversight: Array<{
    title: string;
    agency?: string;
    date?: string;
    type?: string;
    status?: string;
  }>;
  documents: Array<{
    id: string;
    title: string;
    category?: string;
    agency?: string;
    uploaded_at?: string;
  }>;
  notifications: {
    unread_count: number;
    recent: Array<{ title: string; type?: string; agency?: string; created_at?: string }>;
  };
  people: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    agency?: string | null;
    active: boolean;
  }>;
}

// ── AI Tool Use / Action Types ──

export interface AIToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface AIActionProposal {
  tool_name: string;
  tool_input: Record<string, unknown>;
  display: {
    title: string;
    description: string;
    details: Array<{ label: string; value: string }>;
  };
}

export interface ChatToolUseEvent {
  type: 'tool_use';
  action: AIActionProposal;
}

export interface ChatActionResultEvent {
  type: 'action_result';
  success: boolean;
  message: string;
}

/** A collected tool_use block from the Anthropic streaming API */
export interface ToolUseBlock {
  id: string;
  name: string;
  input: string;
}
