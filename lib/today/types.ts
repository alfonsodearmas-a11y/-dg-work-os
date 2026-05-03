// ── Today v1 signal types ────────────────────────────────────────────────────
//
// Shape definitions only. All tunable numbers live in lib/today/thresholds.ts.

import { TODAY_THRESHOLDS } from './thresholds';

export type TodaySignalKind =
  | 'delayed_project'
  | 'tender_sla'
  | 'meeting_action'
  | 'stagnant_tender'
  | 'agency_stagnant_rollup'
  | 'incomplete_psip_data';

export type TodaySeverity = 'critical' | 'high' | 'medium';

export interface TodaySignal {
  id: string;                // `${kind}:${sourceId}` — stable React key
  kind: TodaySignalKind;
  severity: TodaySeverity;
  title: string;
  subtitle: string | null;
  metric: string;            // pre-formatted server-side, e.g. "87 days overdue"
  href: string;
  agency: string | null;     // upper-case slug when present
  sourceId: string;
  dueDate: string | null;    // ISO date
  ageDays: number | null;    // days-overdue | days-over-SLA | days-past-due
  computedAt: string;        // ISO timestamp signal was built
  rollupCount?: number;      // # of underlying records this signal represents; set on rollup kinds, treat undefined as 1
}

export interface TodaySourceHealth {
  ok: boolean;
  error?: string;
}

export interface TodayPayload {
  signals: TodaySignal[];
  counts: {
    critical: number;
    high: number;
    medium: number;
    total: number;
  };
  sources: {
    delayed_projects: TodaySourceHealth;
    tenders: TodaySourceHealth;
    meeting_actions: TodaySourceHealth;
    stagnant_tenders: TodaySourceHealth;
    incomplete_psip: TodaySourceHealth;
  };
  generatedAt: string;
}

// ── Back-compat re-export ────────────────────────────────────────────────────
// Kept for existing test assertions. New callers should import TODAY_THRESHOLDS
// from lib/today/thresholds.ts directly.
export const TENDER_STAGE_SLA_DAYS = TODAY_THRESHOLDS.tender_sla.stage_sla_days;
