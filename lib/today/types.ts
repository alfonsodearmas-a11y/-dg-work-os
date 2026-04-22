// ── Today v1 signal types ────────────────────────────────────────────────────
//
// The home page renders a single prioritized list of items needing attention
// right now, merged from three sources (delayed projects, tender SLA breaches,
// open meeting actions). This file defines the shared shape those sources
// produce and what the /api/today endpoint returns.

import type { TenderStage } from '@/lib/tender/types';

export type TodaySignalKind =
  | 'delayed_project'
  | 'tender_sla'
  | 'meeting_action'
  | 'stagnant_tender'
  | 'agency_stagnant_rollup';

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
    stagnant_tenders: TodaySourceHealth;
  };
  generatedAt: string;
}

// ── Stagnant-tender thresholds ───────────────────────────────────────────────
// stagnant_weeks >= 3 triggers a signal (21+ days of no reported PSIP change).
// Stagnation is agency-independent: any stage, rollovers excluded.

export const STAGNANT_WEEKS_THRESHOLD = 3;

// Individual stagnant tenders get severity bands:
export const STAGNANT_TENDER_CRITICAL = 8;
export const STAGNANT_TENDER_HIGH = 5;

// Agency rollups fire when an agency has ≥ ROLLUP_THRESHOLD stagnant tenders.
// When the rollup fires for an agency, the individual stagnant signals from
// that agency are suppressed — the rollup replaces them.
export const AGENCY_STAGNANT_ROLLUP_THRESHOLD = 3;
export const AGENCY_STAGNANT_CRITICAL = 10;
export const AGENCY_STAGNANT_HIGH = 5;

// ── Tender SLA table (days in stage before breach) ───────────────────────────
// Only stages with a PSIP-provided entry date are SLA-eligible:
//   advertised    → entered on date_advertised
//   evaluation    → entered on date_closed
//   awaiting_award → entered on date_eval_sent_nptab (preferred) or mtb_rtb
// Design has no entry date in the PSIP (pre-advertisement) so no meaningful
// "days in stage" can be computed. Award is terminal.

export const TENDER_STAGE_SLA_DAYS: Record<TenderStage, number | null> = {
  design: null,
  advertised: 30,
  evaluation: 30,
  awaiting_award: 21,
  award: null,
};
