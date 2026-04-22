// ── Pure severity classifiers ────────────────────────────────────────────────
//
// No DB access. Given the raw facts about a row (days overdue, days over SLA,
// due-date relative to today), return a TodaySeverity. The three fetchers in
// signals.ts call these to build TodaySignal.severity.
//
// Thresholds (see plan §"Severity & ordering rules"):
//   delayed_project — HIGH risk already required by caller; this splits by age.
//   tender_sla      — days_over_sla = days_at_current_stage − stage SLA.
//   meeting_action  — due_date relative to today; no_due_date uses created_at.

import type { TodaySeverity } from './types';
import {
  TENDER_STAGE_SLA_DAYS,
  STAGNANT_TENDER_CRITICAL,
  STAGNANT_TENDER_HIGH,
  AGENCY_STAGNANT_CRITICAL,
  AGENCY_STAGNANT_HIGH,
} from './types';
import type { TenderStage } from '@/lib/tender/types';

// ── Delayed projects ─────────────────────────────────────────────────────────
// Caller passes only HIGH-risk (or stalled-union) projects. days_overdue may
// be null for stalled-only rows that aren't past their end_date yet.

export function severityForDelayedProject(daysOverdue: number | null): TodaySeverity {
  if (daysOverdue !== null && daysOverdue >= 90) return 'critical';
  if (daysOverdue !== null && daysOverdue >= 30) return 'high';
  return 'medium';
}

// ── Tender SLA ───────────────────────────────────────────────────────────────

export function daysOverSla(stage: TenderStage, daysAtCurrentStage: number): number | null {
  const sla = TENDER_STAGE_SLA_DAYS[stage];
  if (sla === null) return null;
  return daysAtCurrentStage - sla;
}

export function severityForTenderSla(overSla: number): TodaySeverity {
  if (overSla >= 30) return 'critical';
  if (overSla >= 14) return 'high';
  return 'medium';
}

// ── Meeting actions ──────────────────────────────────────────────────────────
// daysPastDue: null means no due_date; positive is past, negative is upcoming.
// Bands: critical ≥14d past, high 1–13d past, medium due within next 7d or
// no-due-date items older than 30d.

export function severityForMeetingAction(input: {
  daysPastDue: number | null;
  daysSinceCreated: number;
}): TodaySeverity | null {
  const { daysPastDue, daysSinceCreated } = input;

  if (daysPastDue === null) {
    return daysSinceCreated >= 30 ? 'medium' : null;
  }
  if (daysPastDue >= 14) return 'critical';
  if (daysPastDue >= 1) return 'high';
  if (daysPastDue >= -7) return 'medium';
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
  if (stagnantWeeks >= STAGNANT_TENDER_CRITICAL) return 'critical';
  if (stagnantWeeks >= STAGNANT_TENDER_HIGH) return 'high';
  return 'medium';
}

export function severityForAgencyStagnantRollup(count: number): TodaySeverity {
  if (count >= AGENCY_STAGNANT_CRITICAL) return 'critical';
  if (count >= AGENCY_STAGNANT_HIGH) return 'high';
  return 'medium';
}

// ── Ordering ─────────────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<TodaySeverity, number> = { critical: 0, high: 1, medium: 2 };

export function severityRank(s: TodaySeverity): number {
  return SEVERITY_ORDER[s];
}
