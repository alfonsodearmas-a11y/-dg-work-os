// ── Pure severity classifiers ────────────────────────────────────────────────
// No DB access. All tunable numbers come from lib/today/thresholds.ts.

import type { TodaySeverity } from './types';
import type { TenderStage } from '@/lib/tender/types';
import { TODAY_THRESHOLDS } from './thresholds';

const T = TODAY_THRESHOLDS;

// ── Delayed projects ─────────────────────────────────────────────────────────
// Caller passes only HIGH-risk (or stalled-union) projects. days_overdue may
// be null for stalled-only rows that aren't past their end_date yet.

export function severityForDelayedProject(daysOverdue: number | null): TodaySeverity {
  if (daysOverdue !== null && daysOverdue >= T.delayed_project.critical_days_overdue) return 'critical';
  if (daysOverdue !== null && daysOverdue >= T.delayed_project.high_days_overdue) return 'high';
  return 'medium';
}

// ── Tender SLA ───────────────────────────────────────────────────────────────

export function daysOverSla(stage: TenderStage, daysAtCurrentStage: number): number | null {
  const sla = T.tender_sla.stage_sla_days[stage];
  if (sla === null) return null;
  return daysAtCurrentStage - sla;
}

export function severityForTenderSla(overSla: number): TodaySeverity {
  if (overSla >= T.tender_sla.critical_days_over_sla) return 'critical';
  if (overSla >= T.tender_sla.high_days_over_sla) return 'high';
  return 'medium';
}

// ── Meeting actions ──────────────────────────────────────────────────────────
// daysPastDue: null means no due_date; positive is past, negative is upcoming.

export function severityForMeetingAction(input: {
  daysPastDue: number | null;
  daysSinceCreated: number;
}): TodaySeverity | null {
  const { daysPastDue, daysSinceCreated } = input;
  const M = T.meeting_action;

  if (daysPastDue === null) {
    return daysSinceCreated >= M.medium_no_due_age_days ? 'medium' : null;
  }
  if (daysPastDue >= M.critical_days_past_due) return 'critical';
  if (daysPastDue >= M.high_days_past_due) return 'high';
  if (daysPastDue >= -M.medium_due_within_days) return 'medium';
  return null;
}

// ── Days helpers (pure, testable) ────────────────────────────────────────────
// Use calendar-date math, not ms-to-days, so DST and near-midnight don't flip a
// day. `now` is injectable for tests.

export function daysBetweenDates(earlierISO: string, laterISO: string): number {
  const e = new Date(earlierISO);
  const l = new Date(laterISO);
  const eUTC = Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate());
  const lUTC = Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate());
  return Math.floor((lUTC - eUTC) / (1000 * 60 * 60 * 24));
}

export function daysSinceISO(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null;
  return daysBetweenDates(iso, now.toISOString());
}

// ── Stagnant tenders ─────────────────────────────────────────────────────────

export function severityForStagnantTender(stagnantWeeks: number): TodaySeverity {
  if (stagnantWeeks >= T.stagnant_tender.critical_weeks) return 'critical';
  if (stagnantWeeks >= T.stagnant_tender.high_weeks) return 'high';
  return 'medium';
}

export function severityForAgencyStagnantRollup(count: number): TodaySeverity {
  if (count >= T.agency_stagnant_rollup.critical_count) return 'critical';
  if (count >= T.agency_stagnant_rollup.high_count) return 'high';
  return 'medium';
}

// ── Incomplete PSIP data ─────────────────────────────────────────────────────

export function severityForIncompletePsip(count: number): TodaySeverity {
  if (count >= T.incomplete_psip.critical_count) return 'critical';
  if (count >= T.incomplete_psip.high_count) return 'high';
  return 'medium';
}

// ── Ordering ─────────────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<TodaySeverity, number> = { critical: 0, high: 1, medium: 2 };

export function severityRank(s: TodaySeverity): number {
  return SEVERITY_ORDER[s];
}
