// ── Today v1 signal types ────────────────────────────────────────────────────
//
// The home page renders a single prioritized list of items needing attention
// right now, merged from three sources (delayed projects, tender SLA breaches,
// open meeting actions). This file defines the shared shape those sources
// produce and what the /api/today endpoint returns.

import type { TenderStage } from '@/lib/tender/types';

export type TodaySignalKind = 'delayed_project' | 'tender_sla' | 'meeting_action';

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
  };
  generatedAt: string;
}

// ── Tender SLA table (days in stage before breach) ───────────────────────────
// Source: Today v1 spec. `award` has no SLA because it's the terminal stage —
// time-in-stage there is expected (and the kanban/archive surface it differently).

export const TENDER_STAGE_SLA_DAYS: Record<TenderStage, number | null> = {
  design: 45,
  advertised: 30,
  evaluation: 30,
  awaiting_award: 21,
  award: null,
};
